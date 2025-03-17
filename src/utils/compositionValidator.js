/**
 * Validates the composition JSON structure
 * @param {Object} composition - The composition object to validate
 * @returns {Object} Validation result with isValid and error message
 */
function validateComposition(composition) {
    try {
        // Check required top-level fields
        if (!composition.title) {
            return { isValid: false, error: 'Missing title field' };
        }
        if (!composition.description) {
            return { isValid: false, error: 'Missing description field' };
        }
        if (!Array.isArray(composition.parties)) {
            return { isValid: false, error: 'Missing or invalid parties array' };
        }

        // Validate each party
        for (const [partyIndex, party] of composition.parties.entries()) {
            if (!party.name) {
                return { isValid: false, error: `Party at index ${partyIndex} is missing name field` };
            }
            if (!Array.isArray(party.weapons)) {
                return { isValid: false, error: `Party "${party.name}" is missing weapons array` };
            }

            // Validate each weapon in the party
            for (const [weaponIndex, weapon] of party.weapons.entries()) {
                if (!weapon.type) {
                    return { isValid: false, error: `Weapon at index ${weaponIndex} in party "${party.name}" is missing type field` };
                }
                if (typeof weapon.players_required !== 'number' || weapon.players_required < 0) {
                    return { isValid: false, error: `Invalid players_required for weapon "${weapon.type}" in party "${party.name}"` };
                }
                if (typeof weapon.free_role !== 'boolean') {
                    return { isValid: false, error: `Invalid free_role for weapon "${weapon.type}" in party "${party.name}"` };
                }
                if (!weapon.description && weapon.description !== '') {
                    return { isValid: false, error: `Missing description for weapon "${weapon.type}" in party "${party.name}"` };
                }
            }
        }

        return { isValid: true, error: null };
    } catch (error) {
        return { isValid: false, error: `Validation error: ${error.message}` };
    }
}

module.exports = {
    validateComposition
};
