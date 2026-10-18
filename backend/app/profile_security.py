"""Private profile ACLs: POSIX modes on Mac, protected inheritable DACL on Windows."""
import ctypes
import os
from pathlib import Path


def _windows_api():
    from ctypes import wintypes as w
    adv = ctypes.WinDLL('advapi32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    adv.OpenProcessToken.argtypes = [w.HANDLE, w.DWORD, ctypes.POINTER(w.HANDLE)]
    adv.GetTokenInformation.argtypes = [w.HANDLE, ctypes.c_int, w.LPVOID, w.DWORD, ctypes.POINTER(w.DWORD)]
    adv.ConvertSidToStringSidW.argtypes = [w.LPVOID, ctypes.POINTER(w.LPWSTR)]
    adv.ConvertStringSecurityDescriptorToSecurityDescriptorW.argtypes = [w.LPCWSTR, w.DWORD, ctypes.POINTER(w.LPVOID), ctypes.POINTER(w.DWORD)]
    adv.SetFileSecurityW.argtypes = [w.LPCWSTR, w.DWORD, w.LPVOID]
    adv.GetFileSecurityW.argtypes = [w.LPCWSTR, w.DWORD, w.LPVOID, w.DWORD, ctypes.POINTER(w.DWORD)]
    adv.ConvertSecurityDescriptorToStringSecurityDescriptorW.argtypes = [w.LPVOID, w.DWORD, w.DWORD, ctypes.POINTER(w.LPWSTR), ctypes.POINTER(w.DWORD)]
    kernel.GetCurrentProcess.restype = w.HANDLE
    kernel.CloseHandle.argtypes = [w.HANDLE]
    kernel.LocalFree.argtypes = [w.LPVOID]
    kernel.LocalFree.restype = w.LPVOID
    return adv, kernel, w


def windows_user_sid():
    adv, kernel, w = _windows_api()
    token = w.HANDLE()
    if not adv.OpenProcessToken(kernel.GetCurrentProcess(), 8, ctypes.byref(token)):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        length = w.DWORD()
        adv.GetTokenInformation(token, 1, None, 0, ctypes.byref(length))
        buffer = ctypes.create_string_buffer(length.value)
        if not adv.GetTokenInformation(token, 1, buffer, length, ctypes.byref(length)):
            raise ctypes.WinError(ctypes.get_last_error())
        sid_pointer = ctypes.cast(buffer, ctypes.POINTER(w.LPVOID))[0]
        text = w.LPWSTR()
        if not adv.ConvertSidToStringSidW(sid_pointer, ctypes.byref(text)):
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            return text.value
        finally:
            kernel.LocalFree(text)
    finally:
        kernel.CloseHandle(token)


def secure_profile(directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    if os.name != 'nt':
        directory.chmod(0o700)
        return
    adv, kernel, w = _windows_api()
    descriptor = w.LPVOID()
    sddl = f'D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FA;;;{windows_user_sid()})'
    if not adv.ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, 1, ctypes.byref(descriptor), None):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        if not adv.SetFileSecurityW(str(directory.resolve()), 0x80000004, descriptor):
            raise ctypes.WinError(ctypes.get_last_error())
    finally:
        kernel.LocalFree(descriptor)


def windows_dacl(path):
    adv, kernel, w = _windows_api()
    length = w.DWORD()
    adv.GetFileSecurityW(str(Path(path).resolve()), 4, None, 0, ctypes.byref(length))
    buffer = ctypes.create_string_buffer(length.value)
    if not adv.GetFileSecurityW(str(Path(path).resolve()), 4, buffer, length, ctypes.byref(length)):
        raise ctypes.WinError(ctypes.get_last_error())
    text = w.LPWSTR()
    if not adv.ConvertSecurityDescriptorToStringSecurityDescriptorW(buffer, 1, 4, ctypes.byref(text), None):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return text.value
    finally:
        kernel.LocalFree(text)
