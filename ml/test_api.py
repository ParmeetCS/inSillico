import urllib.request, json

req = urllib.request.Request('http://localhost:3000/api/predict',
    data=json.dumps({'smiles': 'CC(=O)OC1=CC=CC=C1C(=O)O'}).encode(),
    headers={'Content-Type': 'application/json'})
res = urllib.request.urlopen(req)
d = json.loads(res.read())

print('=== ML-Predicted Properties for Aspirin ===')
print()
names = {'logp':'LogP','pka':'pKa (acidic)','solubility':'Solubility','tpsa':'TPSA','bioavailability':'Bioavailability','toxicity':'Toxicity Risk'}
for key, prop in d['properties'].items():
    name = names.get(key, key)
    val = f"{prop['value']} {prop['unit']}"
    print(f"  {name:20s} {val:15s}  [{prop['status']}]")

print()
print(f"  Confidence: {d['confidence']}%")
print(f"  Formula: {d['molecule']['formula']}")
print(f"  MW: {d['molecule']['molecular_weight']}")
print(f"  QED (drug-likeness): {d['molecule']['qed']}")
print()
print("Toxicity Screening:")
for k, v in d['toxicity_screening'].items():
    print(f"  {k}: {v}%")
