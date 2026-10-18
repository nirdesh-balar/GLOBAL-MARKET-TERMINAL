"""Redacted Yahoo failures. Absence of an HTTP status is not proof of an outage."""
import socket,ssl,time,math
from datetime import datetime,timezone
from email.utils import parsedate_to_datetime
from .base import ProviderError

def retry_after(value,now=None):
    try: seconds=float(value)
    except (ValueError,TypeError):
        try:seconds=parsedate_to_datetime(value).timestamp()-(time.time() if now is None else now)
        except (ValueError,TypeError,OverflowError):return 60
    return max(1,math.ceil(seconds)) if math.isfinite(seconds) else 60

def classify(error):
    response=getattr(error,'response',None);status=getattr(response,'status_code',None)
    headers=getattr(response,'headers',{})or{}
    if status==429:return ProviderError('Yahoo Finance is rate limited. Wait before retrying.','rate',retry_after(headers.get('Retry-After')),code='rate_limited',http_status=429)
    if status in (401,403):return ProviderError('Yahoo Finance denied access to this request. Change Symbol or try later.','access',code='access_denied',http_status=status)
    if status==404:return ProviderError('Yahoo has no available history for this ticker. Change Symbol or choose another timeframe.','missing',code='unavailable_symbol',http_status=404)
    if status is not None and status>=500:return ProviderError('Yahoo Finance is temporarily unavailable. Retry shortly.','temporary',retry_after(headers.get('Retry-After')) if headers.get('Retry-After') else 0,code='provider_failure',http_status=status)
    name=type(error).__name__.lower();code=getattr(error,'code',None)
    if isinstance(error,(TimeoutError,))or 'timeout'in name or code==28:return ProviderError('Yahoo Finance timed out. Retry this chart.','temporary',code='timeout')
    if isinstance(error,socket.gaierror)or 'dns'in name or code in (5,6):return ProviderError('Yahoo Finance hostname could not be resolved. Check DNS or your connection, then Retry.','temporary',code='dns')
    if isinstance(error,ssl.SSLError)or 'ssl'in name or code in (35,51,58,60,77):return ProviderError('A secure connection to Yahoo Finance could not be established. Check your network or certificate settings.','temporary',code='tls',retryable=False)
    if isinstance(error,(ConnectionError,ConnectionRefusedError))or 'connection'in name or code in (7,18,52,55,56):return ProviderError('Connection interrupted while loading Yahoo Finance history. Retry this chart.','temporary',code='connection')
    if status is not None:return ProviderError('Yahoo rejected this ticker/timeframe request. Change Symbol or choose another timeframe.','source',code='unsupported_request',http_status=status)
    return ProviderError('The Yahoo chart response could not be processed. Retry once or change the symbol; report this issue if it persists.','source',code='application',retryable=False)
