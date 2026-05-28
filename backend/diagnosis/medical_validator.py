VALID_MEDICINES = {"paracetamol", "ibuprofen", "amoxicillin"}
VALID_TESTS = {"cbc", "blood test", "x-ray", "mri"}

def validate_output(output):
    meds = output.get("recommended_medications", [])
    tests = output.get("recommended_tests", [])

    # ❌ REMOVE strict filtering
    # ✅ just clean duplicates + empty

    output["recommended_medications"] = list(set(
        [m.strip() for m in meds if m]
    ))

    output["recommended_tests"] = list(set(
        [t.strip() for t in tests if t]
    ))

    output["disclaimer"] = "AI suggestion — doctor verification required"

    return output