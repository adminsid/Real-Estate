#!/usr/bin/env python3
"""Check an existing local shared secret against the gateway without disclosing it.
Uses a deliberately invalid SSO token; never creates a session or reads user data.
"""
import json, pathlib, ssl, urllib.request, urllib.error
root=pathlib.Path(__file__).resolve().parent.parent
values={}
for line in (root/'.dev.vars').read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key,value=line.split('=',1);values[key.strip()]=value.strip().strip('\"\'')
secret=values.get('INTERNAL_API_SECRET')
if not secret: raise SystemExit('Local shared secret is unavailable')
request=urllib.request.Request('https://workspace.primeamericany.com/api/sso/validate',data=json.dumps({'token':'connected-preflight-invalid-token'}).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+secret},method='POST')
try:
    with urllib.request.urlopen(request,timeout=15,context=ssl.create_default_context(cafile='/etc/ssl/cert.pem')) as response:
        body=json.load(response)
except urllib.error.HTTPError as error:
    try: body=json.load(error)
    except Exception: raise SystemExit('Gateway returned a non-JSON error; secret match unverified')
except urllib.error.URLError as error: raise SystemExit('Gateway unavailable ('+str(error.reason)+'); secret match unverified')
error=str(body.get('error',''))
if 'Unauthorized SSO validation request' in error: raise SystemExit('Local shared secret does not match gateway')
if 'Invalid' in error and 'token' in error.lower(): print('Gateway accepted shared-secret check and rejected the synthetic SSO token')
else: raise SystemExit('Unexpected response; shared-secret match unverified')
