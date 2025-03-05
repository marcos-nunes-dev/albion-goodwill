const weapons = require('../utils/weapons');

class AlbionItems {
    constructor() {
        this.isInitialized = false;
    }

    async init() {
        // Initialize any necessary data
        this.isInitialized = true;
    }

    getWeapons() {
        return weapons.weapons;
    }

    validateWeaponName(weaponName) {
        return weapons.weapons.some(weapon => 
            Object.values(weapon.LocalizedNames).some(name => 
                name.toLowerCase() === weaponName.toLowerCase()
            )
        );
    }
}

module.exports = new AlbionItems();