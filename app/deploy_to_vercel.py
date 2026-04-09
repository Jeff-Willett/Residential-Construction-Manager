import os
import requests
import json
import hashlib
import base64

def get_file_hash(content):
    return hashlib.sha1(content).hexdigest()

def deploy():
    project_id = 'prj_34R39DfvzvXM05tXFpvmabXhhmBc'
    token = os.environ.get('VERCEL_TOKEN')
    team_id = os.environ.get('VERCEL_TEAM_ID')

    if not token:
        print("Error: VERCEL_TOKEN environment variable not set.")
        return

    base_path = '/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential Construction Manager/app'
    files_to_deploy = []

    for root, dirs, files in os.walk(base_path):
        if 'node_modules' in dirs:
            dirs.remove('node_modules')
        if 'dist' in dirs:
            dirs.remove('dist')
        if '.git' in dirs:
            dirs.remove('.git')
        
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, base_path)
            
            # Read file as bytes to handle potential binary files and for hashing
            with open(full_path, 'rb') as f:
                content = f.read()
                
            files_to_deploy.append({
                "file": rel_path,
                "data": base64.b64encode(content).decode('utf-8'),
                "encoding": "base64"
            })

    print(f"Collected {len(files_to_deploy)} files for deployment.")

    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }

    payload = {
        'name': 'residential-construction-manager',
        'project': project_id,
        'files': files_to_deploy
    }

    url = 'https://api.vercel.com/v13/deployments'
    if team_id:
        url += f'?teamId={team_id}'

    print("Initiating Vercel deployment...")
    response = requests.post(url, headers=headers, json=payload)
    
    if response.status_code in [200, 201]:
        data = response.json()
        print(f"Deployment created successfully!")
        print(f"Deployment ID: {data.get('id')}")
        print(f"Check status at: https://vercel.com/deployments/{data.get('id')}")
    else:
        print(f"Error creating deployment: {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    deploy()
