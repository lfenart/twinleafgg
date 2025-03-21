"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FairyEnergy = void 0;
const card_types_1 = require("../../game/store/card/card-types");
const energy_card_1 = require("../../game/store/card/energy-card");
class FairyEnergy extends energy_card_1.EnergyCard {
    constructor() {
        super(...arguments);
        this.provides = [card_types_1.CardType.FAIRY];
        this.set = 'XY';
        this.regulationMark = 'ENERGY';
        this.cardImage = 'assets/cardback.png';
        this.setNumber = '140';
        this.name = 'Fairy Energy';
        this.fullName = 'Fairy Energy XY';
    }
}
exports.FairyEnergy = FairyEnergy;
