import { GameError } from '../../game-error';
import { GameLog, GameMessage } from '../../game-message';
import { BoardEffect, CardTag, SpecialCondition, Stage, SuperType, TrainerType } from '../card/card-types';
import { TrainerCard } from '../card/trainer-card';
import { ApplyWeaknessEffect, DealDamageEffect } from '../effects/attack-effects';
import { AddSpecialConditionsPowerEffect, CheckAttackCostEffect, CheckPokemonStatsEffect, CheckPokemonTypeEffect, CheckProvidedEnergyEffect } from '../effects/check-effects';
import { AttackEffect, EvolveEffect, HealEffect, KnockOutEffect, PowerEffect, TrainerPowerEffect, UseAttackEffect, UsePowerEffect, UseStadiumEffect, UseTrainerPowerEffect } from '../effects/game-effects';
import { AfterAttackEffect, EndTurnEffect } from '../effects/game-phase-effects';
import { ChooseAttackPrompt } from '../prompts/choose-attack-prompt';
import { CoinFlipPrompt } from '../prompts/coin-flip-prompt';
import { ConfirmPrompt } from '../prompts/confirm-prompt';
import { StateUtils } from '../state-utils';
import { CardList } from '../state/card-list';
import { GamePhase } from '../state/state';
import { checkState } from './check-effect';
import { MoveCardsEffect } from '../effects/game-effects';
import { PokemonCardList } from '../state/pokemon-card-list';
import { MOVE_CARDS } from '../prefabs/prefabs';
function applyWeaknessAndResistance(damage, cardTypes, additionalCardTypes, weakness, resistance) {
    let multiply = 1;
    let modifier = 0;
    const allTypes = [...cardTypes, ...additionalCardTypes];
    for (const item of weakness) {
        if (allTypes.includes(item.type)) {
            if (item.value === undefined) {
                multiply *= 2;
            }
            else {
                modifier += item.value;
            }
        }
    }
    for (const item of resistance) {
        if (allTypes.includes(item.type)) {
            modifier += item.value;
        }
    }
    return (damage * multiply) + modifier;
}
function* useAttack(next, store, state, effect) {
    const player = effect.player;
    const opponent = StateUtils.getOpponent(state, player);
    //Skip attack on first turn
    if (state.turn === 1 && effect.attack.canUseOnFirstTurn !== true && state.rules.attackFirstTurn == false) {
        throw new GameError(GameMessage.CANNOT_ATTACK_ON_FIRST_TURN);
    }
    const sp = player.active.specialConditions;
    if (sp.includes(SpecialCondition.PARALYZED) || sp.includes(SpecialCondition.ASLEEP)) {
        throw new GameError(GameMessage.BLOCKED_BY_SPECIAL_CONDITION);
    }
    // if (player.alteredCreationDamage == true) {
    //   player.forEachPokemon(PlayerType.BOTTOM_PLAYER, cardList => {
    //     if (effect instanceof DealDamageEffect && effect.source === cardList) {
    //       effect.damage += 20;
    //     }
    //   });
    // }
    const attack = effect.attack;
    let attackingPokemon = player.active;
    // Check for attacks that can be used from bench
    player.bench.forEach(benchSlot => {
        const benchPokemon = benchSlot.getPokemonCard();
        if (benchPokemon && benchPokemon.attacks.some(a => a.name === attack.name && a.useOnBench)) {
            attackingPokemon = benchSlot;
        }
    });
    const attackingPokemonCard = attackingPokemon.getPokemonCard();
    const checkAttackCost = new CheckAttackCostEffect(player, attack);
    state = store.reduceEffect(state, checkAttackCost);
    const checkProvidedEnergy = new CheckProvidedEnergyEffect(player, attackingPokemon);
    state = store.reduceEffect(state, checkProvidedEnergy);
    if (StateUtils.checkEnoughEnergy(checkProvidedEnergy.energyMap, checkAttackCost.cost) === false) {
        throw new GameError(GameMessage.NOT_ENOUGH_ENERGY);
    }
    if (sp.includes(SpecialCondition.CONFUSED)) {
        let flip = false;
        store.log(state, GameLog.LOG_FLIP_CONFUSION, { name: player.name });
        yield store.prompt(state, new CoinFlipPrompt(player.id, GameMessage.FLIP_CONFUSION), result => {
            flip = result;
            next();
        });
        if (flip === false) {
            store.log(state, GameLog.LOG_HURTS_ITSELF);
            player.active.damage += 30;
            state = store.reduceEffect(state, new EndTurnEffect(player));
            return state;
        }
    }
    store.log(state, GameLog.LOG_PLAYER_USES_ATTACK, { name: player.name, attack: attack.name });
    state.phase = GamePhase.ATTACK;
    const attackEffect = (effect instanceof AttackEffect) ? effect : new AttackEffect(player, opponent, attack);
    state = store.reduceEffect(state, attackEffect);
    if (store.hasPrompts()) {
        yield store.waitPrompt(state, () => next());
    }
    if (attackEffect.damage > 0) {
        const dealDamage = new DealDamageEffect(attackEffect, attackEffect.damage);
        state = store.reduceEffect(state, dealDamage);
    }
    attackingPokemonCard.attacksThisTurn += 1;
    const afterAttackEffect = new AfterAttackEffect(effect.player);
    store.reduceEffect(state, afterAttackEffect);
    if (store.hasPrompts()) {
        yield store.waitPrompt(state, () => next());
    }
    // Check for knockouts and process them
    state = checkState(store, state);
    // Check if the opponent's active Pokémon is knocked out
    if (opponent.active.cards.length === 0) {
        // Wait for the opponent to select a new active Pokémon
        yield store.waitPrompt(state, () => next());
    }
    function useSubsequentAttack(attack) {
        const nextAttackEffect = new AttackEffect(player, opponent, attack);
        state = useAttack(() => next(), store, state, nextAttackEffect).next().value;
        if (store.hasPrompts()) {
            state = store.waitPrompt(state, () => next());
        }
        if (nextAttackEffect.damage > 0) {
            const dealDamage = new DealDamageEffect(nextAttackEffect, nextAttackEffect.damage);
            state = store.reduceEffect(state, dealDamage);
        }
        state = store.reduceEffect(state, new EndTurnEffect(player));
        return state;
    }
    // Now, we can check if the Pokémon can attack again
    const canAttackAgain = attackingPokemonCard.maxAttacksThisTurn > attackingPokemonCard.attacksThisTurn;
    if (canAttackAgain) {
        // Prompt the player if they want to attack again
        yield store.prompt(state, new ConfirmPrompt(player.id, GameMessage.WANT_TO_ATTACK_AGAIN), wantToAttackAgain => {
            if (wantToAttackAgain) {
                if (attackingPokemonCard.allowSubsequentAttackChoice) {
                    const attackableCards = player.active.cards.filter(card => card.superType === SuperType.POKEMON || (card.superType === SuperType.TRAINER && card instanceof TrainerCard &&
                        card.trainerType === TrainerType.TOOL && card.attacks.length > 0));
                    // Use ChooseAttackPrompt for Barrage ability
                    store.prompt(state, new ChooseAttackPrompt(player.id, GameMessage.CHOOSE_ATTACK_TO_COPY, attackableCards, { allowCancel: false }), selection => {
                        return useSubsequentAttack(selection);
                    });
                }
                else {
                    return useSubsequentAttack(attack);
                }
            }
            else {
                state = store.reduceEffect(state, new EndTurnEffect(player));
            }
            next();
        });
    }
    if (!canAttackAgain) {
        return store.reduceEffect(state, new EndTurnEffect(player));
    }
}
export function gameReducer(store, state, effect) {
    if (effect instanceof KnockOutEffect) {
        // const player = effect.player;
        const card = effect.target.getPokemonCard();
        if (card !== undefined) {
            //Altered Creation GX
            // if (player.usedAlteredCreation == true) {
            //   effect.prizeCount += 1;
            // }
            // Pokemon ex rule
            if (card.tags.includes(CardTag.POKEMON_EX) || card.tags.includes(CardTag.POKEMON_V) || card.tags.includes(CardTag.POKEMON_VSTAR) || card.tags.includes(CardTag.POKEMON_ex) || card.tags.includes(CardTag.POKEMON_GX) || card.tags.includes(CardTag.TAG_TEAM)) {
                effect.prizeCount += 1;
            }
            if (card.tags.includes(CardTag.POKEMON_VMAX) || card.tags.includes(CardTag.POKEMON_VUNION)) {
                effect.prizeCount += 2;
            }
            store.log(state, GameLog.LOG_POKEMON_KO, { name: card.name });
            const stadiumCard = StateUtils.getStadiumCard(state);
            if (card.tags.includes(CardTag.PRISM_STAR) || stadiumCard && stadiumCard.name === 'Lost City') {
                const lostZoned = new CardList();
                const pokemonIndices = effect.target.cards.map((card, index) => index);
                for (let i = pokemonIndices.length - 1; i >= 0; i--) {
                    const removedCard = effect.target.cards.splice(pokemonIndices[i], 1)[0];
                    if (removedCard.cards) {
                        // Move attached cards to discard
                        MOVE_CARDS(store, state, removedCard.cards, effect.player.discard);
                    }
                    if (removedCard.superType === SuperType.POKEMON || removedCard.stage === Stage.BASIC) {
                        lostZoned.cards.push(removedCard);
                    }
                    else {
                        effect.player.discard.cards.push(removedCard);
                    }
                }
                // Move cards to lost zone
                MOVE_CARDS(store, state, lostZoned, effect.player.lostzone);
                effect.target.clearEffects();
            }
            else {
                // Move cards to discard
                MOVE_CARDS(store, state, effect.target, effect.player.discard);
                effect.target.clearEffects();
            }
            // const stadiumCard = StateUtils.getStadiumCard(state);
            // if (card.tags.includes(CardTag.PRISM_STAR) || stadiumCard && stadiumCard.name === 'Lost City') {
            //   effect.target.moveTo(effect.player.lostzone);
            //   effect.target.clearEffects();
            // } else {
            //   effect.target.moveTo(effect.player.discard);
            //   effect.target.clearEffects();
            // }
        }
    }
    if (effect instanceof ApplyWeaknessEffect) {
        const checkPokemonType = new CheckPokemonTypeEffect(effect.source);
        state = store.reduceEffect(state, checkPokemonType);
        const checkPokemonStats = new CheckPokemonStatsEffect(effect.target);
        state = store.reduceEffect(state, checkPokemonStats);
        const cardType = checkPokemonType.cardTypes;
        const additionalCardTypes = checkPokemonType.cardTypes;
        const weakness = effect.ignoreWeakness ? [] : checkPokemonStats.weakness;
        const resistance = effect.ignoreResistance ? [] : checkPokemonStats.resistance;
        effect.damage = applyWeaknessAndResistance(effect.damage, cardType, additionalCardTypes, weakness, resistance);
        return state;
    }
    if (effect instanceof UseAttackEffect) {
        const generator = useAttack(() => generator.next(), store, state, effect);
        return generator.next().value;
    }
    if (effect instanceof UsePowerEffect) {
        const player = effect.player;
        const power = effect.power;
        const card = effect.card;
        store.log(state, GameLog.LOG_PLAYER_USES_ABILITY, { name: player.name, ability: power.name });
        state = store.reduceEffect(state, new PowerEffect(player, power, card));
        return state;
    }
    if (effect instanceof UseTrainerPowerEffect) {
        const player = effect.player;
        const power = effect.power;
        const card = effect.card;
        store.log(state, GameLog.LOG_PLAYER_USES_ABILITY, { name: player.name, ability: power.name });
        state = store.reduceEffect(state, new TrainerPowerEffect(player, power, card));
        return state;
    }
    if (effect instanceof AddSpecialConditionsPowerEffect) {
        const target = effect.target;
        effect.specialConditions.forEach(sp => {
            target.addSpecialCondition(sp);
        });
        if (effect.poisonDamage !== undefined) {
            target.poisonDamage = effect.poisonDamage;
        }
        if (effect.burnDamage !== undefined) {
            target.burnDamage = effect.burnDamage;
        }
        if (effect.sleepFlips !== undefined) {
            target.sleepFlips = effect.sleepFlips;
        }
        return state;
    }
    if (effect instanceof UseStadiumEffect) {
        const player = effect.player;
        store.log(state, GameLog.LOG_PLAYER_USES_STADIUM, { name: player.name, stadium: effect.stadium.name });
        player.stadiumUsedTurn = state.turn;
    }
    // if (effect instanceof TrainerEffect && effect.trainerCard.trainerType === TrainerType.SUPPORTER) {
    //   const player = effect.player;
    //   store.log(state, GameLog.LOG_PLAYER_PLAYS_SUPPORTER, { name: player.name, stadium: effect.trainerCard.name });
    // }
    if (effect instanceof HealEffect) {
        effect.target.damage = Math.max(0, effect.target.damage - effect.damage);
        return state;
    }
    if (effect instanceof EvolveEffect) {
        const pokemonCard = effect.target.getPokemonCard();
        if (pokemonCard === undefined) {
            throw new GameError(GameMessage.INVALID_TARGET);
        }
        store.log(state, GameLog.LOG_PLAYER_EVOLVES_POKEMON, {
            name: effect.player.name,
            pokemon: pokemonCard.name,
            card: effect.pokemonCard.name
        });
        effect.player.hand.moveCardTo(effect.pokemonCard, effect.target);
        effect.target.pokemonPlayedTurn = state.turn;
        // effect.target.clearEffects();
        // Apply the removePokemonEffects method from the Player class
        // effect.player.removePokemonEffects(effect.target);
        effect.target.specialConditions = [];
        effect.target.marker.markers = [];
        effect.target.marker.markers = [];
        effect.target.marker.markers = [];
    }
    if (effect instanceof MoveCardsEffect) {
        const source = effect.source;
        const destination = effect.destination;
        // If source is a PokemonCardList, always clean up when moving cards
        if (source instanceof PokemonCardList) {
            source.clearEffects();
            source.damage = 0;
            source.specialConditions = [];
            source.marker.markers = [];
            source.tool = undefined;
            source.removeBoardEffect(BoardEffect.ABILITY_USED);
        }
        // If specific cards are specified
        if (effect.cards) {
            if (source instanceof PokemonCardList) {
                source.moveCardsTo(effect.cards, destination);
                if (effect.toBottom) {
                    destination.cards = [...destination.cards.slice(effect.cards.length), ...effect.cards];
                }
                else if (effect.toTop) {
                    destination.cards = [...effect.cards, ...destination.cards];
                }
            }
            else {
                source.moveCardsTo(effect.cards, destination);
                if (effect.toBottom) {
                    destination.cards = [...destination.cards.slice(effect.cards.length), ...effect.cards];
                }
                else if (effect.toTop) {
                    destination.cards = [...effect.cards, ...destination.cards];
                }
            }
        }
        // If count is specified
        else if (effect.count !== undefined) {
            const cards = source.cards.slice(0, effect.count);
            source.moveCardsTo(cards, destination);
            if (effect.toBottom) {
                destination.cards = [...destination.cards.slice(cards.length), ...cards];
            }
            else if (effect.toTop) {
                destination.cards = [...cards, ...destination.cards];
            }
        }
        // Move all cards
        else {
            if (effect.toTop) {
                source.moveToTopOfDestination(destination);
            }
            else {
                source.moveTo(destination);
            }
        }
        // If source is a PokemonCardList and we moved all cards, discard remaining attached cards
        if (source instanceof PokemonCardList && source.getPokemons().length === 0) {
            const player = StateUtils.findOwner(state, source);
            source.moveTo(player.discard);
        }
        return state;
    }
    return state;
}
