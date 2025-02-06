import { PokemonCard } from '../../game/store/card/pokemon-card';
import { Stage, CardType, SuperType, EnergyType } from '../../game/store/card/card-types';
import { StoreLike, State, StateUtils, DamageMap, PlayerType, PutDamagePrompt, GameMessage, SlotType, EnergyCard, DiscardEnergyPrompt } from '../../game';
import { Effect } from '../../game/store/effects/effect';
import { PutCountersEffect } from '../../game/store/effects/attack-effects';
import { AttackEffect } from '../../game/store/effects/game-effects';
import { CheckHpEffect } from '../../game/store/effects/check-effects';

export class Sinistcha extends PokemonCard {
  public stage: Stage = Stage.STAGE_1;
  public evolvesFrom = 'Poltchageist';
  public cardType: CardType = CardType.GRASS;
  public hp: number = 70;
  public weakness = [{ type: CardType.FIRE }];
  public retreat = [ CardType.COLORLESS ];

  public attacks = [
    { 
      name: 'Cursed Drop', 
      cost: [ CardType.GRASS ], 
      damage: 0, 
      text: 'Put 4 damage counters on your opponent\'s Pokémon in any way you like.' 
    },
    { 
      name: 'Spill the Tea', 
      cost: [ CardType.GRASS ], 
      damage: 70, 
      damageCalculation: 'x',
      text: 'Discard up to 3 [G] Energy cards from your Pokémon. This attack does 70 damage for each card you discarded in this way.' 
    },
  ];

  public set: string = 'TWM';
  public name: string = 'Sinistcha';
  public fullName: string = 'Sinistcha TWM';
  public regulationMark = 'H';
  public cardImage: string = 'assets/cardback.png';
  public setNumber: string = '22';

  public reduceEffect(store: StoreLike, state: State, effect: Effect): State {
    // Cursed Drop
    if (effect instanceof AttackEffect && effect.attack === this.attacks[0]){
      const player = effect.player;
      const opponent = StateUtils.getOpponent(state, player);

      const maxAllowedDamage: DamageMap[] = [];
      let damageLeft = 0;

      opponent.forEachPokemon(PlayerType.TOP_PLAYER, (cardList, card, target) => {
        const checkHpEffect = new CheckHpEffect(opponent, cardList);
        store.reduceEffect(state, checkHpEffect);
        damageLeft += checkHpEffect.hp - cardList.damage;
        maxAllowedDamage.push({ target, damage: checkHpEffect.hp });
      });

      const damage = Math.min(40, damageLeft);

      return store.prompt(state, new PutDamagePrompt(
        effect.player.id,
        GameMessage.CHOOSE_POKEMON_TO_DAMAGE,
        PlayerType.TOP_PLAYER,
        [ SlotType.ACTIVE, SlotType.BENCH ],
        damage,
        maxAllowedDamage,
        { allowCancel: false }
      ), targets => {
        const results = targets || [];
        for (const result of results) {
          const target = StateUtils.getTarget(state, player, result.target);
          const putCountersEffect = new PutCountersEffect(effect, result.damage);
          putCountersEffect.target = target;
          store.reduceEffect(state, putCountersEffect);
        }
      });
    }

    // Spill the Tea
    if (effect instanceof AttackEffect && effect.attack === this.attacks[1]){
      const player = effect.player;
      
      let totalGrassEnergy = 0;
      player.forEachPokemon(PlayerType.BOTTOM_PLAYER, (cardList) => {
        const grassCount = cardList.cards.filter(card =>
          card instanceof EnergyCard && card.name === 'Grass Energy'
        ).length;
        totalGrassEnergy += grassCount;
      });

      console.log('Total Grass Energy: ' + totalGrassEnergy);

      return store.prompt(state, new DiscardEnergyPrompt(
        player.id,
        GameMessage.CHOOSE_ENERGIES_TO_DISCARD,
        PlayerType.BOTTOM_PLAYER,
        [SlotType.ACTIVE, SlotType.BENCH],// Card source is target Pokemon
        { superType: SuperType.ENERGY, energyType: EnergyType.BASIC, name: 'Grass Energy' },
        { min: 0, max: Math.min(totalGrassEnergy, 3), allowCancel: false }
      ), transfers => {

        if (transfers === null) {
          return;
        }

        for (const transfer of transfers) {
          let totalDiscarded = 0;

          const source = StateUtils.getTarget(state, player, transfer.from);
          const target = player.discard;
          source.moveCardTo(transfer.card, target);

          totalDiscarded = transfers.length;

          effect.damage = totalDiscarded * 70;

        }
        console.log('Total Damage: ' + effect.damage);
        return state;
      });
    }

    return state;
  }
  
}