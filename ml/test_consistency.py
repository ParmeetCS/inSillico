"""Test value consistency between ML predictions and drug-likeness."""
import requests
import json

molecules = {
    "Benzene": "c1ccccc1",
    "Aspirin": "CC(=O)OC1=CC=CC=C1C(=O)O",
    "Caffeine": "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",
    "Ethanol": "CCO",
}

issues = []

for name, smiles in molecules.items():
    sep = "=" * 60
    print(f"\n{sep}")
    print(f"  {name} ({smiles})")
    print(sep)
    r = requests.post("http://localhost:5001/predict", json={"smiles": smiles}, timeout=30)
    if r.status_code != 200:
        print(f"  ERROR: {r.status_code} - {r.text[:200]}")
        issues.append(f"{name}: API error {r.status_code}")
        continue
    d = r.json()
    props = d.get("properties", {})
    dl = d.get("drug_likeness", {})
    lip = dl.get("lipinski", {})
    veber = dl.get("veber", {})
    pains = dl.get("pains", {})
    mol_info = d.get("molecule", {})

    print(f"  Molecule: {mol_info['formula']}, MW={mol_info['molecular_weight']}")
    print(f"  QED: {mol_info['qed']}")
    print()

    # --- Predicted Properties ---
    print("  --- Predicted Properties ---")
    for k, v in props.items():
        val_str = str(v["value"]) if v["value"] is not None else "N/A"
        print(f"    {k:18s} = {val_str:>10}  [{v['status']:>8}]  conf={v.get('confidence', '?')}")
        if k == "pka":
            print(f"    {'':18s}   ionizable={v.get('ionizable', 'NOT SET')}")
    print()

    # --- Drug-Likeness ---
    print("  --- Drug-Likeness ---")
    print(f"    Score: {dl['score']} / 100  Grade: {dl['grade']}  QED: {dl['qed']}")
    print(f"    Lipinski violations: {lip['violations']}")
    for rule in lip.get("rules", []):
        print(f"      {rule['rule']:18s} val={str(rule['value']):>8}  passed={rule['passed']}")
    print(f"    Veber violations: {veber.get('violations', '?')}")
    for rule in veber.get("rules", []):
        print(f"      {rule['rule']:25s} val={str(rule['value']):>8}  passed={rule['passed']}")
    print(f"    PAINS: passed={pains.get('passed')}  alerts={pains.get('alert_count')}")
    print()

    # --- Consistency Checks ---
    print("  --- Consistency Checks ---")

    # 1. LogP match
    pred_logp = props.get("logp", {}).get("value")
    lip_logp = None
    for rule in lip.get("rules", []):
        if "LogP" in rule["rule"]:
            lip_logp = rule["value"]
    match = pred_logp == lip_logp
    print(f"    [{'OK' if match else 'FAIL'}] LogP consistency: predicted={pred_logp}, lipinski={lip_logp}")
    if not match:
        issues.append(f"{name}: LogP mismatch predicted={pred_logp} vs lipinski={lip_logp}")

    # 2. pKa — non-ionizable should be None
    pka_val = props.get("pka", {}).get("value")
    ionizable = props.get("pka", {}).get("ionizable")
    if ionizable is False and pka_val is not None:
        print(f"    [FAIL] pKa: ionizable=False but value={pka_val} (should be None)")
        issues.append(f"{name}: pKa not None for non-ionizable molecule")
    elif ionizable is True and pka_val is None:
        print(f"    [FAIL] pKa: ionizable=True but value is None")
        issues.append(f"{name}: pKa is None for ionizable molecule")
    else:
        print(f"    [OK  ] pKa: ionizable={ionizable}, value={pka_val}")

    # 3. TPSA status
    tpsa_val = props.get("tpsa", {}).get("value")
    tpsa_status = props.get("tpsa", {}).get("status")
    if tpsa_val is not None:
        if tpsa_val < 20 and tpsa_status == "poor":
            print(f"    [FAIL] TPSA={tpsa_val} status={tpsa_status} (should not be 'poor' for low TPSA)")
            issues.append(f"{name}: TPSA={tpsa_val} incorrectly labeled 'poor'")
        else:
            print(f"    [OK  ] TPSA={tpsa_val} status={tpsa_status}")

    # 4. Drugability score vs text consistency
    score = dl["score"]
    all_pass = lip["violations"] == 0 and veber.get("violations", 0) == 0 and pains.get("passed", True)
    if all_pass and score < 50:
        print(f"    [WARN] Score={score} but all filters pass (low QED drives score down)")
    elif not all_pass and score >= 70:
        print(f"    [WARN] Score={score} but has violations")
    else:
        print(f"    [OK  ] Score={score}, all_pass={all_pass}")

    # 5. Bioavailability vs TPSA/LogP narrative
    bio_val = props.get("bioavailability", {}).get("value")
    bio_status = props.get("bioavailability", {}).get("status")
    logp_status = props.get("logp", {}).get("status")
    if tpsa_status == "poor" and bio_status == "optimal":
        print(f"    [FAIL] TPSA={tpsa_status} contradicts bioavailability={bio_status}")
        issues.append(f"{name}: TPSA 'poor' contradicts bioavailability 'optimal'")
    else:
        print(f"    [OK  ] TPSA={tpsa_status}, bioavail={bio_status} (no contradiction)")

    # 6. MW consistency (molecule.molecular_weight vs lipinski MW)
    mol_mw = mol_info.get("molecular_weight")
    lip_mw = None
    for rule in lip.get("rules", []):
        if "MW" in rule["rule"]:
            lip_mw = rule["value"]
    if mol_mw and lip_mw and abs(mol_mw - lip_mw) > 0.2:
        print(f"    [FAIL] MW mismatch: molecule={mol_mw} vs lipinski={lip_mw}")
        issues.append(f"{name}: MW mismatch {mol_mw} vs {lip_mw}")
    else:
        print(f"    [OK  ] MW: molecule={mol_mw}, lipinski={lip_mw}")


print(f"\n{'=' * 60}")
print(f"  SUMMARY")
print(f"{'=' * 60}")
if issues:
    print(f"  {len(issues)} issue(s) found:")
    for issue in issues:
        print(f"    - {issue}")
else:
    print("  All consistency checks passed!")
print()
