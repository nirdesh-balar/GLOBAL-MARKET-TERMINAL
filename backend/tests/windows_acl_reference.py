"""Read-only Windows test oracle. No ACL writes and no raw security data escape.

The production SDDL/permission policy is deliberately not changed here. Binary
SID comparison diagnoses text mismatches; original textual assertions remain.
"""
import ctypes as c
from contextlib import ExitStack
from dataclasses import dataclass
import os
from pathlib import Path
import re


class Inconclusive(Exception):
    """Fixed private API failure; never include WinError text or native values."""


@dataclass(frozen=True)
class Ace:
    kind: int
    flags: int
    mask: int
    roles: tuple  # EqualSid results in SYSTEM, Administrators, current-user order.


@dataclass(frozen=True)
class Snapshot:
    present: bool
    protected: bool
    aces: tuple
    legacy_subset: bool


KINDS = frozenset({'profile_directory', 'profile_child', 'migration_parent', 'migration_backup'})
CODES = frozenset({'STRICT_MATCH', 'EQUIVALENT_SID', 'API_INCONCLUSIVE',
    'MISSING_DACL', 'SPECIAL_ACE', 'UNEXPECTED_INHERITED', 'UNEXPECTED_ALLOW',
    'PROTECTION_MISMATCH', 'INHERITANCE_MISMATCH', 'RIGHTS_MISMATCH'})
FULL_ACCESS = 0x1f01ff
# Documented SID-bearing ACE layouts; reserved compound/unknown layouts are not guessed.
BASIC_TYPES = frozenset({0, 1, 2, 3, 17, 19, 20})
OBJECT_TYPES = frozenset({5, 6, 7, 8, 11, 12, 15, 16})
CALLBACK_TYPES = frozenset({9, 10, 11, 12, 13, 14, 15, 16, 18, 21})
KNOWN_TYPES = BASIC_TYPES | OBJECT_TYPES | CALLBACK_TYPES


def classify(snapshot, kind):
    """Conservative structural policy, not a general Windows AccessCheck engine.

    Deny/callback/object/unknown ACEs fail closed, rather than being ignored.
    Children must inherit only the exact three approved effective grants.
    """
    if kind not in KINDS or type(snapshot) is not Snapshot:
        return 'API_INCONCLUSIVE'
    if (type(snapshot.present) is not bool or type(snapshot.protected) is not bool
            or type(snapshot.legacy_subset) is not bool or type(snapshot.aces) is not tuple
            or len(snapshot.aces) > 128):
        return 'API_INCONCLUSIVE'
    if not snapshot.present or not snapshot.aces:
        return 'MISSING_DACL'
    for ace in snapshot.aces:
        if (type(ace) is not Ace or any(type(n) is not int for n in (ace.kind, ace.flags, ace.mask))
                or not 0 <= ace.kind <= 255 or not 0 <= ace.flags <= 255
                or not 0 <= ace.mask <= 0xffffffff or type(ace.roles) is not tuple
                or len(ace.roles) != 3 or any(type(v) is not bool for v in ace.roles)):
            return 'API_INCONCLUSIVE'
    if any(a.kind not in KNOWN_TYPES for a in snapshot.aces):
        return 'API_INCONCLUSIVE'
    if any(a.kind != 0 for a in snapshot.aces):
        return 'SPECIAL_ACE'
    # Inspect inherited grants before interpreting protection or text aliases.
    if any(a.flags & 0x10 and not any(a.roles) for a in snapshot.aces):
        return 'UNEXPECTED_INHERITED'
    if any(not any(a.roles) for a in snapshot.aces):
        return 'UNEXPECTED_ALLOW'
    if snapshot.protected != (kind == 'profile_directory'):
        return 'PROTECTION_MISMATCH'
    expected_flags = {'profile_directory': 3, 'profile_child': 16,
                      'migration_parent': 19, 'migration_backup': 16}[kind]
    if any(a.flags != expected_flags for a in snapshot.aces):
        return 'INHERITANCE_MISMATCH'
    # Exactly the original three effective full-access grants, no extra rights,
    # duplicate grants, inherit-only grants, missing roles or SID-prefix matches.
    if (len(snapshot.aces) != 3 or any(a.mask != FULL_ACCESS or sum(a.roles) != 1 for a in snapshot.aces)
            or any(sum(a.roles[i] for a in snapshot.aces) != 1 for i in range(3))):
        return 'RIGHTS_MISMATCH'
    return 'STRICT_MATCH' if snapshot.legacy_subset else 'EQUIVALENT_SID'


class Header(c.Structure):
    _fields_ = [('kind', c.c_ubyte), ('flags', c.c_ubyte), ('size', c.c_uint16)]


class AclSize(c.Structure):
    _fields_ = [('count', c.c_uint32), ('used', c.c_uint32), ('free', c.c_uint32)]


class NativeReader:
    """All entry points have explicit pointer-sized prototypes. Read APIs only."""
    def __init__(self):
        if os.name != 'nt':
            raise Inconclusive()
        self.adv = c.WinDLL('advapi32', use_last_error=True)
        self.kernel = c.WinDLL('kernel32', use_last_error=True)
        p, u, b = c.c_void_p, c.c_uint32, c.c_int32
        signatures = {
            'GetFileSecurityW': ([c.c_wchar_p, u, p, u, c.POINTER(u)], b),
            'IsValidSecurityDescriptor': ([p], b),
            'GetSecurityDescriptorControl': ([p, c.POINTER(c.c_uint16), c.POINTER(u)], b),
            'GetSecurityDescriptorDacl': ([p, c.POINTER(b), c.POINTER(p), c.POINTER(b)], b),
            'IsValidAcl': ([p], b),
            'GetAclInformation': ([p, p, u, c.c_int32], b),
            'GetAce': ([p, u, c.POINTER(p)], b),
            'IsValidSid': ([p], b), 'GetLengthSid': ([p], u), 'EqualSid': ([p, p], b),
            'ConvertStringSidToSidW': ([c.c_wchar_p, c.POINTER(p)], b),
            'ConvertStringSecurityDescriptorToSecurityDescriptorW':
                ([c.c_wchar_p, u, c.POINTER(p), c.POINTER(u)], b),
            'ConvertSecurityDescriptorToStringSecurityDescriptorW':
                ([p, u, u, c.POINTER(c.c_wchar_p), c.POINTER(u)], b),
        }
        for name, (args, result) in signatures.items():
            function = getattr(self.adv, name)
            function.argtypes, function.restype = args, result
        self.kernel.LocalFree.argtypes, self.kernel.LocalFree.restype = [p], p

    def require(self, value):
        if not value:
            raise Inconclusive()

    def same_sid(self, left, right):
        # EqualSid requires two validated SIDs. FALSE is inequality, not a guess.
        self.require(self.adv.IsValidSid(left))
        self.require(self.adv.IsValidSid(right))
        return bool(self.adv.EqualSid(left, right))

    def sid(self, text, stack):
        pointer = c.c_void_p()
        self.require(self.adv.ConvertStringSidToSidW(text, c.byref(pointer)))
        if not pointer.value:
            raise Inconclusive()
        stack.callback(self.kernel.LocalFree, pointer)
        self.require(self.adv.IsValidSid(pointer))
        return pointer

    def compare_strings(self, left, right):
        """Fixture-only SID conversion probe; creates no filesystem object."""
        with ExitStack() as stack:
            return self.same_sid(self.sid(left, stack), self.sid(right, stack))

    def descriptor(self, buffer, start, capacity, approved):
        """Validate every ACE and return private binary records for consistency.

        No SID, descriptor or raw record is returned by inspect_private_dacl.
        Read the whole list before classifying, so a valid special ACE cannot
        conceal a malformed later ACE. Unknown layouts remain inconclusive.
        """
        if not 20 <= capacity <= 262144:
            raise Inconclusive()
        self.require(self.adv.IsValidSecurityDescriptor(buffer))
        control, revision = c.c_uint16(), c.c_uint32()
        self.require(self.adv.GetSecurityDescriptorControl(buffer, c.byref(control), c.byref(revision)))
        if revision.value != 1:
            raise Inconclusive()
        present, defaulted, acl = c.c_int32(), c.c_int32(), c.c_void_p()
        self.require(self.adv.GetSecurityDescriptorDacl(buffer, c.byref(present), c.byref(acl), c.byref(defaulted)))
        protected = bool(control.value & 0x1000)
        if not present.value or not acl.value:
            return False, protected, (), ()
        end = start + capacity
        if not start <= acl.value <= end - 8:
            raise Inconclusive()
        acl_bytes = c.c_uint16.from_address(acl.value + 2).value
        if not 8 <= acl_bytes <= end - acl.value:
            raise Inconclusive()
        self.require(self.adv.IsValidAcl(acl))
        size = AclSize()
        self.require(self.adv.GetAclInformation(acl, c.byref(size), c.sizeof(size), 2))
        if not 8 <= size.used <= acl_bytes or size.count > 128:
            raise Inconclusive()
        aces, records = [], []
        cursor = acl.value + 8
        for index in range(size.count):
            pointer = c.c_void_p()
            self.require(self.adv.GetAce(acl, index, c.byref(pointer)))
            if not pointer.value or pointer.value != cursor or cursor > acl.value + size.used - 4:
                raise Inconclusive()
            header = Header.from_address(pointer.value)
            if header.size < 16 or header.size % 4 or header.size > acl.value + size.used - cursor:
                raise Inconclusive()
            if header.kind not in KNOWN_TYPES:
                raise Inconclusive()
            sid_offset = 8
            if header.kind in OBJECT_TYPES:
                if header.size < 20 or c.c_ubyte.from_address(acl.value).value != 4:
                    raise Inconclusive()
                flags = c.c_uint32.from_address(cursor + 8).value
                if flags & ~3:
                    raise Inconclusive()
                sid_offset = 12 + 16 * bool(flags & 1) + 16 * bool(flags & 2)
            if sid_offset + 8 > header.size:
                raise Inconclusive()
            sid = cursor + sid_offset
            count = c.c_ubyte.from_address(sid + 1).value
            sid_bytes = 8 + 4 * count
            if count > 15 or sid_offset + sid_bytes > header.size:
                raise Inconclusive()
            if header.kind not in CALLBACK_TYPES and sid_offset + sid_bytes != header.size:
                raise Inconclusive()
            self.require(self.adv.IsValidSid(sid))
            if self.adv.GetLengthSid(sid) != sid_bytes:
                raise Inconclusive()
            mask = c.c_uint32.from_address(cursor + 4).value
            roles = tuple(self.same_sid(sid, expected) for expected in approved)
            aces.append(Ace(header.kind, header.flags, mask, roles))
            records.append(c.string_at(cursor, header.size))
            cursor += header.size
        if cursor != acl.value + size.used:
            raise Inconclusive()
        return True, protected, tuple(aces), tuple(records)

    def read(self, path):
        from app.profile_security import windows_user_sid
        user = windows_user_sid()  # Actual process token; never username/environment.
        length = c.c_uint32()
        ok = self.adv.GetFileSecurityW(str(Path(path).resolve()), 4, None, 0, c.byref(length))
        if ok or c.get_last_error() != 122 or not 20 <= length.value <= 262144:
            raise Inconclusive()
        buffer = c.create_string_buffer(length.value)
        self.require(self.adv.GetFileSecurityW(str(Path(path).resolve()), 4, buffer, len(buffer), c.byref(length)))
        with ExitStack() as stack:
            approved = [self.sid(value, stack) for value in ('SY', 'BA', user)]
            present, protected, aces, records = self.descriptor(buffer, c.addressof(buffer), len(buffer), approved)
            if not present or not aces:
                return Snapshot(present, protected, aces, False)
            text = c.c_wchar_p()
            self.require(self.adv.ConvertSecurityDescriptorToStringSecurityDescriptorW(buffer, 1, 4, c.byref(text), None))
            if not c.cast(text, c.c_void_p).value:
                raise Inconclusive()
            stack.callback(self.kernel.LocalFree, c.cast(text, c.c_void_p))
            if not text.value or len(text.value) > 262144:
                raise Inconclusive()
            # The documented Windows codec validates SDDL, including nested
            # conditional syntax. Never parse or execute its expressions ourselves.
            converted, converted_size = c.c_void_p(), c.c_uint32()
            self.require(self.adv.ConvertStringSecurityDescriptorToSecurityDescriptorW(text, 1, c.byref(converted), c.byref(converted_size)))
            if not converted.value:
                raise Inconclusive()
            stack.callback(self.kernel.LocalFree, converted)
            other = self.descriptor(converted, converted.value, converted_size.value, approved)
            if other[:2] != (present, protected) or other[3] != records:
                raise Inconclusive()
            # Exact ordered binary ACE records must agree before any policy result.
            # Special ACEs no longer pass through an allow-only count comparison.
            if any(ace.kind != 0 for ace in aces):
                return Snapshot(True, protected, aces, False)
            trustees = re.findall(r'\(A;[^)]*;;;([^;)]+)\)', text.value)
            if len(trustees) != len(aces):
                raise Inconclusive()
            legacy_subset = bool(trustees) and set(trustees) <= {'SY', 'BA', user}
        return Snapshot(True, protected, aces, legacy_subset)


def inspect_private_dacl(path, kind):
    """Expose exactly one fixed classification; never native exception details."""
    try:
        return classify(NativeReader().read(path), kind)
    except (Inconclusive, OSError, ValueError, OverflowError):
        return 'API_INCONCLUSIVE'
