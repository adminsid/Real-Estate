#!/usr/bin/env python3
"""Verify isolated SQL restores and optionally recover every referenced R2 object.
Input: private directory containing workspace/openhouse/inventory/hub.sql exports.
No production writes; object downloads use Wrangler and produce a hash manifest.
"""
import argparse, concurrent.futures, hashlib, json, os, pathlib, sqlite3, subprocess, sys, time
parser = argparse.ArgumentParser()
parser.add_argument('directory', type=pathlib.Path)
parser.add_argument('--download-media', action='store_true')
args = parser.parse_args()
os.umask(0o077)
root = args.directory.resolve(); root.mkdir(parents=True, exist_ok=True, mode=0o700)
repo = pathlib.Path(__file__).resolve().parent.parent
buckets = {'workspace':'re-workspace-assets','openhouse':'open-house-photos','inventory':'listing-input-media','hub':'prime-america-assets'}
manifest = {'databases':[], 'objects':[]}
references = set()
for app, bucket in buckets.items():
    source = root / f'{app}.sql'
    if not source.exists():
        manifest['databases'].append({'database':app,'state':'export_missing'}); continue
    target = root / f'{app}-drill-{time.time_ns()}.sqlite'
    db = sqlite3.connect(target); started = time.monotonic()
    try:
        db.executescript(source.read_text())
        integrity = db.execute('PRAGMA integrity_check').fetchone()[0]
        violations = len(db.execute('PRAGMA foreign_key_check').fetchall())
        manifest['databases'].append({'database':app,'state':'restored','seconds':round(time.monotonic()-started,3),
          'integrity':integrity,'foreign_key_violations':violations,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
          'export_mtime':source.stat().st_mtime})
        columns = {'workspace':{'documents':['file_key']},'openhouse':{'events':['photo_key','flyer_key','agent_photo_key','agent_photo_2_key']},
          'inventory':{'project_media':['object_key'],'project_documents':['object_key'],'media':['object_key']},
          'hub':{'assets':['url','thumbnailUrl'],'user':['logo_url','headshot_url'],'social_post_submissions':['asset_url']}}[app]
        for table, wanted in columns.items():
            actual = {row[1] for row in db.execute(f'PRAGMA table_info("{table}")')}
            for column in set(wanted) & actual:
                condition = " AND COALESCE(is_folder,0)=0" if app == "workspace" and table == "documents" and "is_folder" in actual else ""
                for (key,) in db.execute(f'SELECT "{column}" FROM "{table}" WHERE "{column}" IS NOT NULL' + condition):
                    if not key: continue
                    if app == 'hub':
                        if not key.startswith('/storage/'): continue
                        key = key[len('/storage/'):]
                    references.add((bucket,key))
    except Exception as error:
        manifest['databases'].append({'database':app,'state':'failed','error':str(error)})
    finally: db.close()
media = root / 'media'; media.mkdir(exist_ok=True,mode=0o700)
def download(reference):
    bucket,key = reference
    identifier = hashlib.sha256((bucket+'/'+key).encode()).hexdigest()
    path = media/identifier
    command=[str(repo/'node_modules/.bin/wrangler'),'r2','object','get',bucket+'/'+key,'--remote','--file',str(path)]
    env=dict(os.environ,WRANGLER_LOG_PATH=str(root/'wrangler-media.log'))
    try:
        result=subprocess.run(command,cwd=repo,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=120)
    except subprocess.TimeoutExpired:
        return {'bucket':bucket,'key':key,'state':'download_failed','reason':'timeout'}
    if result.returncode: return {'bucket':bucket,'key':key,'state':'download_failed'}
    return {'bucket':bucket,'key':key,'state':'downloaded','file':identifier,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
if args.download_media:
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for index,result in enumerate(pool.map(download,sorted(references)),1):
            manifest['objects'].append(result)
            if index%25==0: print(f'Recovered {index}/{len(references)} referenced objects',flush=True)
else:
    manifest['objects']=[{'bucket':bucket,'key':key,'state':'not_downloaded'} for bucket,key in sorted(references)]
manifest_path=root/('recovery-manifest.json' if args.download_media else 'restore-manifest.json')
manifest_path.write_text(json.dumps(manifest,indent=2))
print(json.dumps({'database_results':manifest['databases'],'referenced_objects':len(references),
 'downloaded_objects':sum(row['state']=='downloaded' for row in manifest['objects']),
 'failed_objects':sum(row['state']=='download_failed' for row in manifest['objects'])},indent=2))

if any(row['state'] != 'restored' or row.get('integrity') != 'ok' or row.get('foreign_key_violations') for row in manifest['databases']) or any(row['state']=='download_failed' for row in manifest['objects']):
    sys.exit(1)
