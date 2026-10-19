"""Controlled fixtures are not native Windows ACL evidence on macOS."""
import ctypes as c
from dataclasses import replace
import json
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from app.profile_security import secure_profile
from windows_acl_reference import (Ace, Snapshot, NativeReader, Inconclusive,
    FULL_ACCESS, CODES, classify, inspect_private_dacl)


def snapshot(kind='profile_directory', legacy=True):
    flags = {'profile_directory': 3, 'profile_child': 16,
             'migration_parent': 19, 'migration_backup': 16}[kind]
    return Snapshot(True, kind == 'profile_directory', tuple(
        Ace(0, flags, FULL_ACCESS, tuple(i == j for j in range(3))) for i in range(3)), legacy)


@pytest.mark.parametrize('kind',['profile_directory','profile_child','migration_parent','migration_backup'])
@pytest.mark.parametrize('legacy',[True,False],ids=['same-text','equivalent-identity'])
def test_policy_exact_three_roles(kind,legacy):
    assert classify(snapshot(kind,legacy),kind) == ('STRICT_MATCH' if legacy else 'EQUIVALENT_SID')


@pytest.mark.parametrize('kind',['profile_directory','profile_child','migration_backup'])
@pytest.mark.parametrize('trustee',['everyone','users','authenticated-users','unrelated-user'])
def test_unexpected_trustees_rejected(kind,trustee):
    # Deliberately all unequal binary-comparison results; no text normalization.
    value = snapshot(kind,False)
    unexpected = Ace(0,value.aces[0].flags,FULL_ACCESS,(False,False,False))
    value = replace(value,aces=value.aces+(unexpected,))
    code = 'UNEXPECTED_INHERITED' if unexpected.flags & 16 else 'UNEXPECTED_ALLOW'
    assert classify(value,kind) == code
    assert trustee not in json.dumps(value.__dict__,default=lambda x:x.__dict__)


@pytest.mark.parametrize('ace_type',[1,4,5,6,9,10,11,12,17,255])
def test_denied_and_special_aces_are_not_ignored(ace_type):
    value = snapshot()
    value = replace(value,aces=value.aces+(Ace(ace_type,0,0,(False,False,False)),))
    assert classify(value,'profile_directory') == ('API_INCONCLUSIVE' if ace_type in {4,255} else 'SPECIAL_ACE')


@pytest.mark.parametrize('flags',[0,1,2,4,8,16,19,255])
def test_directory_inheritance_mismatch_fails_closed(flags):
    value = snapshot();value = replace(value,aces=(replace(value.aces[0],flags=flags),)+value.aces[1:])
    assert classify(value,'profile_directory') == 'INHERITANCE_MISMATCH'


@pytest.mark.parametrize('flags',[0,3,4,8,17,19,24,255])
def test_child_inherit_only_and_extra_flags_fail_closed(flags):
    value = snapshot('profile_child');value = replace(value,aces=(replace(value.aces[0],flags=flags),)+value.aces[1:])
    assert classify(value,'profile_child') == 'INHERITANCE_MISMATCH'


@pytest.mark.parametrize('kind',['profile_directory','profile_child','migration_backup'])
def test_protection_mismatch(kind):
    value=snapshot(kind)
    assert classify(replace(value,protected=not value.protected),kind) == 'PROTECTION_MISMATCH'


@pytest.mark.parametrize('mask',[0,1,0x10000000,0x1f01fe,0xffffffff])
def test_missing_or_extra_rights_rejected(mask):
    value=snapshot();value=replace(value,aces=(replace(value.aces[0],mask=mask),)+value.aces[1:])
    assert classify(value,'profile_directory') == 'RIGHTS_MISMATCH'


@pytest.mark.parametrize('change',['missing','duplicate','role-overlap','extra','null','empty','invalid-role','bad-type','too-many'])
def test_malformed_or_incomplete_policy_rejected(change):
    value=snapshot()
    if change=='missing':value=replace(value,aces=value.aces[:2])
    if change=='duplicate':value=replace(value,aces=value.aces+(value.aces[0],))
    if change=='role-overlap':value=replace(value,aces=(replace(value.aces[0],roles=(True,True,False)),)+value.aces[1:])
    if change=='extra':value=replace(value,aces=value.aces+(replace(value.aces[0],mask=1),))
    if change=='null':value=replace(value,present=False)
    if change=='empty':value=replace(value,aces=())
    if change=='invalid-role':value=replace(value,aces=(replace(value.aces[0],roles=(1,False,False)),)+value.aces[1:])
    if change=='bad-type':value=replace(value,aces=(replace(value.aces[0],flags=True),)+value.aces[1:])
    if change=='too-many':value=replace(value,aces=value.aces*44)
    expected = {'null':'MISSING_DACL','empty':'MISSING_DACL','invalid-role':'API_INCONCLUSIVE',
                'bad-type':'API_INCONCLUSIVE','too-many':'API_INCONCLUSIVE'}.get(change,'RIGHTS_MISMATCH')
    assert classify(value,'profile_directory') == expected


def test_inconclusive_never_looks_safe(monkeypatch):
    assert classify(snapshot(),'unreviewed') == 'API_INCONCLUSIVE'
    assert classify(None,'profile_directory') == 'API_INCONCLUSIVE'
    import windows_acl_reference as oracle
    for exc in [Inconclusive(),OSError('PRIVATE_SID_PATH_SENTINEL'),ValueError('PRIVATE_SID_PATH_SENTINEL')]:
        monkeypatch.setattr(oracle,'NativeReader',Mock(side_effect=exc))
        result=inspect_private_dacl(Path('PRIVATE_SID_PATH_SENTINEL'),'profile_directory')
        assert result=='API_INCONCLUSIVE' and 'PRIVATE' not in result
    monkeypatch.setattr(oracle,'NativeReader',Mock(side_effect=RuntimeError('must not hide programmer defects')))
    with pytest.raises(RuntimeError):inspect_private_dacl(Path('.'),'profile_directory')


@pytest.mark.parametrize('valid,equal',[(False,False),(False,True),(True,False),(True,True)])
def test_equal_sid_requires_valid_inputs(valid,equal):
    reader=NativeReader.__new__(NativeReader)
    reader.adv=SimpleNamespace(IsValidSid=Mock(return_value=valid),EqualSid=Mock(return_value=equal))
    if valid:
        assert reader.same_sid(1,2) is equal
        reader.adv.EqualSid.assert_called_once_with(1,2)
    else:
        with pytest.raises(Inconclusive):reader.same_sid(1,2)
        reader.adv.EqualSid.assert_not_called()


def test_second_sid_is_validated():
    reader=NativeReader.__new__(NativeReader)
    reader.adv=SimpleNamespace(IsValidSid=Mock(side_effect=[True,False]),EqualSid=Mock())
    with pytest.raises(Inconclusive):reader.same_sid(1,2)
    reader.adv.EqualSid.assert_not_called()


def test_allocated_sid_freed_on_conversion_comparison_failure():
    reader=NativeReader.__new__(NativeReader);freed=[];calls=[]
    def convert(text,out):
        c.cast(out,c.POINTER(c.c_void_p))[0]=123 if text=='first' else 456
        calls.append(text);return True
    reader.adv=SimpleNamespace(ConvertStringSidToSidW=convert,IsValidSid=Mock(return_value=True),EqualSid=Mock(side_effect=Inconclusive()))
    reader.kernel=SimpleNamespace(LocalFree=lambda p:freed.append(p.value))
    with pytest.raises(Inconclusive):reader.compare_strings('first','second')
    assert calls==['first','second'] and freed==[456,123]


@pytest.mark.parametrize('left,right,expected',[
    ('SY','S-1-5-18',True),('BA','S-1-5-32-544',True),
    ('SY','BA',False),('WD','SY',False),('BU','BA',False),('AU','BA',False),
],ids=['system-alias','administrators-alias','different-approved','everyone-rejected','users-rejected','authenticated-rejected'])
def test_sid_alias_conversion_reference(left,right,expected):
    if os.name=='nt':
        # Actual documented API calls on the future approved native run only.
        assert NativeReader().compare_strings(left,right) is expected
    else:
        # Explicit controlled stand-in; not an implementation fallback.
        fixtures={'SY':b'system','S-1-5-18':b'system','BA':b'admins','S-1-5-32-544':b'admins',
                  'WD':b'world','BU':b'users','AU':b'authenticated'}
        assert (fixtures[left]==fixtures[right]) is expected


@pytest.mark.parametrize('kind',['profile_directory','profile_child','migration_parent','migration_backup'])
def test_disposable_native_object_policy(tmp_path,kind):
    if os.name!='nt':
        assert classify(snapshot(kind),kind)=='STRICT_MATCH'  # Controlled fixture only.
        return
    directory=tmp_path/'isolated profile';secure_profile(directory)
    parent=directory/'migration-backups';parent.mkdir()
    child=directory/'private.json';child.write_text('{}')
    backup=parent/'private.sqlite3';backup.write_bytes(b'fixture-only')
    objects={'profile_directory':directory,'profile_child':child,'migration_parent':parent,'migration_backup':backup}
    # A separate child probe runs even when the original directory text assertion
    # fails; no normal profile, migration or existing object is touched.
    audit=inspect_private_dacl(objects[kind],kind)
    assert audit!='API_INCONCLUSIVE', 'NATIVE_OBJECT_API_INCONCLUSIVE'
    assert audit!='MISSING_DACL', 'NATIVE_OBJECT_MISSING_DACL'
    assert audit!='SPECIAL_ACE', 'NATIVE_OBJECT_SPECIAL_ACE'
    assert audit!='UNEXPECTED_INHERITED', 'NATIVE_OBJECT_UNEXPECTED_INHERITED'
    assert audit!='UNEXPECTED_ALLOW', 'NATIVE_OBJECT_UNEXPECTED_ALLOW'
    assert audit!='PROTECTION_MISMATCH', 'NATIVE_OBJECT_PROTECTION_MISMATCH'
    assert audit!='INHERITANCE_MISMATCH', 'NATIVE_OBJECT_INHERITANCE_MISMATCH'
    assert audit!='RIGHTS_MISMATCH', 'NATIVE_OBJECT_RIGHTS_MISMATCH'
    assert audit in {'STRICT_MATCH','EQUIVALENT_SID'}, 'NATIVE_OBJECT_POLICY'


class MemoryApis:
    """Controlled codec-contract fixture, never a native Windows result.

    Both encodings derive from explicit typed records. The reverse fixture codec
    independently parses those fields; contradiction modes modify only SDDL.
    No normal profile, raw native descriptor, or user-provided text is involved.
    """
    user = 'S-1-5-21-101-102-103-1001'
    tags = {0:'A',1:'D',2:'AU',3:'AL',5:'OA',6:'OD',7:'OU',8:'OL',9:'XA',10:'XD',11:'ZA',12:'ZD'}
    flags = [('OI',1),('CI',2),('NP',4),('IO',8),('ID',16),('SA',64),('FA',128)]
    guid = '00000000-0000-0000-0000-000000000001'

    @staticmethod
    def binary(text):
        text = {'SY':'S-1-5-18','BA':'S-1-5-32-544','WD':'S-1-1-0'}.get(text,text)
        numbers = [int(n) for n in text.split('-')[1:]]
        sub = numbers[2:]
        return bytes([numbers[0],len(sub)])+numbers[1].to_bytes(6,'big')+b''.join(n.to_bytes(4,'little') for n in sub)

    @classmethod
    def encode(cls, records, protected):
        import struct,uuid
        from windows_acl_reference import OBJECT_TYPES
        rows=[]
        for kind,flags,mask,trustee,guid in records:
            body=struct.pack('<I',mask)
            if kind in OBJECT_TYPES:
                body+=struct.pack('<I',1 if guid else 0)
                if guid:body+=uuid.UUID(guid).bytes_le
            body+=cls.binary(trustee)
            rows.append(struct.pack('<BBH',kind,flags,4+len(body))+body)
        revision=4 if any(r[0] in OBJECT_TYPES for r in records) else 2
        acl=struct.pack('<BBHHH',revision,0,8+sum(map(len,rows)),len(rows),0)+b''.join(rows)
        descriptor=bytearray(20)
        descriptor[0]=1
        struct.pack_into('<H',descriptor,2,0x8004|(0x1000 if protected else 0))
        struct.pack_into('<I',descriptor,16,20)
        return bytes(descriptor)+acl

    def __init__(self, mode):
        self.mode=mode;self.allocations=[];self.freed=[];self.equal_calls=0;self.indices=[]
        self.protected=mode not in {'unprotected','child','backup','migration-parent','unexpected-inherited'}
        flags=19 if mode=='migration-parent' else 16 if mode in {'child','backup','unexpected-inherited'} else 3
        self.records=[(0,flags,FULL_ACCESS,name,'') for name in ['SY','BA',self.user]]
        styles={'deny':1,'mixed-deny':1,'object-allow':5,'object-deny':6,'callback-allow':9,'callback-deny':10,
                'callback-object':11,'audit':2,'object-audit':7,'unknown':255,
                'special-contradictory':1,'special-then-malformed':1,'bad-object-flags':5,'bad-object-bounds':5,'bad-object-revision':5}
        if mode in styles:
            indices=range(3) if mode=='deny' else [0] if mode=='special-then-malformed' else [2]
            for index in indices:
                kind=styles[mode];self.records[index]=(kind,flags,FULL_ACCESS,self.user if index==2 else self.records[index][3],
                    self.guid if kind in {5,6,7,11} else '')
        if mode in {'unexpected','unexpected-inherited'}:self.records[1]=(0,flags,FULL_ACCESS,'WD','')
        if mode=='duplicate':self.records[2]=(0,flags,FULL_ACCESS,'SY','')
        if mode=='rights':self.records[2]=(0,flags,1,self.user,'')
        if mode=='empty':self.records=[]
        self.data=self.encode(self.records,self.protected)
        if mode=='bad-object-revision':
            data=bytearray(self.data);data[20]=2;self.data=bytes(data)
        if mode=='trailing-junk':
            data=bytearray(self.data)+b'\0'*4
            data[22:24]=(len(data)-20).to_bytes(2,'little');self.data=bytes(data)

    @staticmethod
    def address(value):
        return value.value if isinstance(value,c.c_void_p) else c.addressof(value)

    def GetFileSecurityW(self,path,info,buffer,capacity,length):
        c.cast(length,c.POINTER(c.c_uint32))[0]=len(self.data)
        if buffer is None:return False
        c.memmove(buffer,self.data,len(self.data));return True

    def IsValidSecurityDescriptor(self,buffer):return self.mode!='invalid-descriptor'

    def GetSecurityDescriptorControl(self,buffer,control,revision):
        address=self.address(buffer)
        c.cast(control,c.POINTER(c.c_uint16))[0]=c.c_uint16.from_address(address+2).value
        c.cast(revision,c.POINTER(c.c_uint32))[0]=1
        return True

    def GetSecurityDescriptorDacl(self,buffer,present,acl,defaulted):
        address=self.address(buffer)
        c.cast(present,c.POINTER(c.c_int32))[0]=self.mode!='absent'
        value=0 if self.mode=='null' else address+20
        if self.mode=='acl-outside':value=address+len(self.data)+4
        c.cast(acl,c.POINTER(c.c_void_p))[0]=value
        return self.mode!='dacl-api-failure'

    def IsValidAcl(self,acl):return self.mode!='invalid-acl'

    def GetAclInformation(self,acl,pointer,size,cls):
        from windows_acl_reference import AclSize
        info=c.cast(pointer,c.POINTER(AclSize)).contents
        info.count=129 if self.mode=='too-many' else c.c_uint16.from_address(acl.value+4).value
        info.used=c.c_uint16.from_address(acl.value+2).value;info.free=0
        return True

    def GetAce(self,acl,index,pointer):
        self.indices.append(index);value=acl.value+8
        for _ in range(index):value+=c.c_uint16.from_address(value+2).value
        if self.mode=='ace-outside':value=acl.value+c.c_uint16.from_address(acl.value+2).value
        if self.mode=='ace-overlap' and index==1:value=acl.value+8
        if self.mode=='short-ace' or self.mode=='special-then-malformed' and index==1:c.c_uint16.from_address(value+2).value=4
        if self.mode=='bad-object-flags' and index==2:c.c_uint32.from_address(value+8).value=8
        if self.mode=='bad-object-bounds' and index==2:c.c_uint16.from_address(value+2).value=20
        if self.mode=='overrun-sid':c.c_ubyte.from_address(value+9).value=15
        c.cast(pointer,c.POINTER(c.c_void_p))[0]=value
        return self.mode!='ace-api-failure'

    def LocalFree(self,pointer):self.freed.append(pointer.value)

    def IsValidSid(self,pointer):return not (self.mode=='invalid-sid' and isinstance(pointer,int))
    def GetLengthSid(self,pointer):return (1 if self.mode=='sid-length-mismatch' else 0)+8+4*c.c_ubyte.from_address(pointer+1).value

    def ConvertStringSidToSidW(self,text,pointer):
        buffer=c.create_string_buffer(self.binary(text));self.allocations.append(buffer)
        c.cast(pointer,c.POINTER(c.c_void_p))[0]=c.addressof(buffer);return True

    def EqualSid(self,left,right):
        self.equal_calls+=1;address=right.value if isinstance(right,c.c_void_p) else right
        length=self.GetLengthSid(left)
        return length==self.GetLengthSid(address) and c.string_at(left,length)==c.string_at(address,length)

    def ConvertSecurityDescriptorToStringSecurityDescriptorW(self,buffer,revision,info,pointer,length):
        text='D:'+('P' if self.protected and self.mode!='contradictory-protection' else '')
        records=list(self.records)
        if self.mode=='contradictory-type':records[2]=(1,*records[2][1:])
        if self.mode=='contradictory-trustee':records[2]=(0,3,FULL_ACCESS,'WD','')
        if self.mode=='contradictory-rights':records[2]=(0,3,1,self.user,'')
        if self.mode=='contradictory-flags':records[2]=(0,16,FULL_ACCESS,self.user,'')
        if self.mode=='special-contradictory':records[2]=(0,*records[2][1:])
        if self.mode=='contradictory-order':records[0],records[1]=records[1],records[0]
        if any(row[0] not in self.tags for row in records):return False
        for kind,flags,mask,trustee,guid in records:
            text+='('+self.tags[kind]+';'+''.join(tag for tag,bit in self.flags if flags&bit)+';'+hex(mask)+';'+guid+';;'+trustee+')'
        if self.mode=='equivalent':text=text.replace(';;;SY',';;;S-1-5-18')
        if self.mode=='text-incomplete':text='D:P'
        if self.mode=='text-malformed':text='D:P(BROKEN'
        value=c.create_unicode_buffer(text);self.allocations.append(value)
        c.cast(pointer,c.POINTER(c.c_wchar_p))[0]=c.cast(value,c.c_wchar_p)
        return self.mode!='text-api-failure'

    def ConvertStringSecurityDescriptorToSecurityDescriptorW(self,text,revision,pointer,length):
        import re
        raw=text.value
        if self.mode=='decode-api-failure' or not re.fullmatch(r'D:P?(?:\([^()]+\))*',raw):return False
        reverse={tag:kind for kind,tag in self.tags.items()};records=[]
        for row in re.findall(r'\(([^()]+)\)',raw):
            tag,flags,mask,guid,inherited_guid,trustee=row.split(';')
            if inherited_guid:return False
            bits=0
            for offset in range(0,len(flags),2):bits|=dict(self.flags)[flags[offset:offset+2]]
            records.append((reverse[tag],bits,int(mask,16),trustee,guid))
        data=self.encode(records,raw.startswith('D:P'))
        value=c.create_string_buffer(data);self.allocations.append(value)
        c.cast(pointer,c.POINTER(c.c_void_p))[0]=c.addressof(value)
        c.cast(length,c.POINTER(c.c_uint32))[0]=len(data)
        return True


@pytest.mark.parametrize('mode,expected',[
    ('valid','STRICT_MATCH'),('equivalent','EQUIVALENT_SID'),('unexpected','UNEXPECTED_ALLOW'),
    ('deny','SPECIAL_ACE'),('mixed-deny','SPECIAL_ACE'),('object-allow','SPECIAL_ACE'),
    ('object-deny','SPECIAL_ACE'),('callback-allow','SPECIAL_ACE'),('callback-deny','SPECIAL_ACE'),
    ('callback-object','SPECIAL_ACE'),('audit','SPECIAL_ACE'),('object-audit','SPECIAL_ACE'),
    ('unknown','API_INCONCLUSIVE'),('duplicate','RIGHTS_MISMATCH'),('rights','RIGHTS_MISMATCH'),
    ('contradictory-type','API_INCONCLUSIVE'),('contradictory-trustee','API_INCONCLUSIVE'),
    ('contradictory-rights','API_INCONCLUSIVE'),('contradictory-flags','API_INCONCLUSIVE'),
    ('decode-api-failure','API_INCONCLUSIVE'),('text-malformed','API_INCONCLUSIVE'),
    ('special-contradictory','API_INCONCLUSIVE'),('special-then-malformed','API_INCONCLUSIVE'),
    ('bad-object-flags','API_INCONCLUSIVE'),('bad-object-bounds','API_INCONCLUSIVE'),
    ('bad-object-revision','API_INCONCLUSIVE'),('trailing-junk','API_INCONCLUSIVE'),
    ('ace-overlap','API_INCONCLUSIVE'),('sid-length-mismatch','API_INCONCLUSIVE'),
    ('contradictory-protection','API_INCONCLUSIVE'),('contradictory-order','API_INCONCLUSIVE'),
    ('empty','MISSING_DACL'),('unprotected','PROTECTION_MISMATCH'),('absent','MISSING_DACL'),('null','MISSING_DACL'),
    ('invalid-descriptor','API_INCONCLUSIVE'),('dacl-api-failure','API_INCONCLUSIVE'),
    ('acl-outside','API_INCONCLUSIVE'),('invalid-acl','API_INCONCLUSIVE'),('too-many','API_INCONCLUSIVE'),
    ('ace-outside','API_INCONCLUSIVE'),('ace-api-failure','API_INCONCLUSIVE'),('short-ace','API_INCONCLUSIVE'),
    ('overrun-sid','API_INCONCLUSIVE'),('invalid-sid','API_INCONCLUSIVE'),
    ('text-incomplete','API_INCONCLUSIVE'),('text-api-failure','API_INCONCLUSIVE'),
])
def test_native_reader_memory_contract(monkeypatch,mode,expected):
    import windows_acl_reference as oracle
    import app.profile_security as production
    apis=MemoryApis(mode);reader=NativeReader.__new__(NativeReader);reader.adv=apis;reader.kernel=apis
    monkeypatch.setattr(production,'windows_user_sid',lambda:apis.user)
    monkeypatch.setattr(oracle.c,'get_last_error',lambda:122,raising=False)
    monkeypatch.setattr(oracle,'NativeReader',lambda:reader)
    result=inspect_private_dacl(Path('controlled-fixture-only'),'profile_directory')
    assert result==expected
    assert result in CODES and apis.user not in result and 'controlled-fixture' not in result
    if mode in {'valid','equivalent','unexpected'}:
        assert apis.equal_calls==18 and apis.indices==[0,1,2,0,1,2]
        assert len(apis.freed)==5  # Three SIDs, SDDL, and converted descriptor.
    if mode in {'ace-outside','ace-api-failure','short-ace','overrun-sid'}:
        assert len(apis.freed)==3


def test_api_prototypes_are_fixed_width_and_pointer_sized(monkeypatch):
    import windows_acl_reference as oracle
    adv,kernel=SimpleNamespace(),SimpleNamespace()
    for name in ['GetFileSecurityW','IsValidSecurityDescriptor','GetSecurityDescriptorControl',
        'GetSecurityDescriptorDacl','IsValidAcl','GetAclInformation','GetAce','IsValidSid',
        'GetLengthSid','EqualSid','ConvertStringSidToSidW','ConvertStringSecurityDescriptorToSecurityDescriptorW',
        'ConvertSecurityDescriptorToStringSecurityDescriptorW']:
        setattr(adv,name,Mock())
    kernel.LocalFree=Mock()
    monkeypatch.setattr(oracle,'os',SimpleNamespace(name='nt'))
    monkeypatch.setattr(oracle.c,'WinDLL',lambda name,**kwargs:adv if name=='advapi32' else kernel,raising=False)
    NativeReader()
    assert adv.GetSecurityDescriptorControl.argtypes==[c.c_void_p,c.POINTER(c.c_uint16),c.POINTER(c.c_uint32)]
    assert adv.GetFileSecurityW.argtypes[3] is c.c_uint32
    assert adv.GetAce.argtypes[2]==c.POINTER(c.c_void_p)
    assert adv.EqualSid.argtypes==[c.c_void_p,c.c_void_p] and adv.EqualSid.restype is c.c_int32
    assert adv.ConvertStringSecurityDescriptorToSecurityDescriptorW.argtypes==[c.c_wchar_p,c.c_uint32,c.POINTER(c.c_void_p),c.POINTER(c.c_uint32)]
    assert kernel.LocalFree.restype is c.c_void_p
    assert c.sizeof(c.c_uint32)==4 and c.sizeof(c.c_uint16)==2


@pytest.mark.parametrize('mode,kind,expected',[
    ('child','profile_child','STRICT_MATCH'),('backup','migration_backup','STRICT_MATCH'),
    ('migration-parent','migration_parent','STRICT_MATCH'),
    ('unexpected-inherited','profile_child','UNEXPECTED_INHERITED'),
])
def test_reader_child_and_backup_inheritance(monkeypatch,mode,kind,expected):
    import windows_acl_reference as oracle
    apis=MemoryApis(mode);reader=NativeReader.__new__(NativeReader);reader.adv=apis;reader.kernel=apis
    monkeypatch.setattr('app.profile_security.windows_user_sid',lambda:apis.user)
    monkeypatch.setattr(oracle.c,'get_last_error',lambda:122,raising=False)
    monkeypatch.setattr(oracle,'NativeReader',lambda:reader)
    assert inspect_private_dacl(Path('controlled-fixture-only'),kind)==expected


@pytest.mark.parametrize('mode',['deny','mixed-deny','object-allow','object-deny','callback-allow','audit','object-audit'])
def test_special_fixture_serialization_matches_binary_types(mode):
    # The test reads actual fixture binary headers, independently of its record list.
    import re
    apis=MemoryApis(mode);text=c.c_wchar_p()
    assert apis.ConvertSecurityDescriptorToStringSecurityDescriptorW(None,1,4,c.byref(text),None)
    headers=[];cursor=28
    for _ in range(3):
        headers.append(apis.data[cursor]);cursor+=int.from_bytes(apis.data[cursor+2:cursor+4],'little')
    serialized=re.findall(r'\(([^;]+);',text.value)
    assert serialized==[apis.tags[kind] for kind in headers]
    assert any(kind!=0 for kind in headers)
    assert cursor==len(apis.data)
