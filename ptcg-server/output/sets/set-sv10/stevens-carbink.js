"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StevensCarbink = void 0;
const game_1 = require("../../game");
const card_types_1 = require("../../game/store/card/card-types");
const attack_effects_1 = require("../../game/store/effects/attack-effects");
const prefabs_1 = require("../../game/store/prefabs/prefabs");
const state_1 = require("../../game/store/state/state");
class StevensCarbink extends game_1.PokemonCard {
    constructor() {
        super(...arguments);
        this.stage = card_types_1.Stage.BASIC;
        this.tags = [card_types_1.CardTag.STEVENS];
        this.cardType = P;
        this.hp = 80;
        this.weakness = [{ type: M }];
        this.retreat = [C, C];
        this.powers = [{
                name: 'Stone Palace',
                powerType: game_1.PowerType.ABILITY,
                text: 'As long as this Pokémon is on the Bench, all of your Steven\'s Pokémon take 30 less damage ' +
                    'from attacks from your opponent\'s Pokémon (after applying Weakness and Resistance). ' +
                    'The effect of Stone Palace doesn\'t stack.'
            }];
        this.attacks = [
            {
                name: 'Magical Shot',
                cost: [P, C, C],
                damage: 80,
                text: ''
            }
        ];
        this.regulationMark = 'I';
        this.set = 'SVOD';
        this.cardImage = 'assets/cardback.png';
        this.setNumber = '3';
        this.name = 'Steven\'s Carbink';
        this.fullName = 'Steven\'s Carbink SVOD';
    }
    reduceEffect(store, state, effect) {
        var _a;
        if (effect instanceof attack_effects_1.PutDamageEffect && game_1.StateUtils.isPokemonInPlay(effect.player, this, game_1.SlotType.BENCH)) {
            const player = effect.player;
            const opponent = game_1.StateUtils.getOpponent(state, player);
            if (effect.damageReduced || state.phase != state_1.GamePhase.ATTACK) {
                return state;
            }
            // Try to reduce PowerEffect, to check if something is blocking our ability
            if (prefabs_1.IS_ABILITY_BLOCKED(store, state, opponent, this)) {
                return state;
            }
            if ((_a = effect.target.getPokemonCard()) === null || _a === void 0 ? void 0 : _a.tags.includes(card_types_1.CardTag.STEVENS)) {
                effect.damage = Math.max(0, effect.damage - 30);
                effect.damageReduced = true;
            }
            return state;
        }
        return state;
    }
}
exports.StevensCarbink = StevensCarbink;
