import { PokemonCard } from '../../game/store/card/pokemon-card';
import { Stage, CardType, CardTag } from '../../game/store/card/card-types';
import { StoreLike, State, PowerType } from '../../game';
import { Effect } from '../../game/store/effects/effect';
export declare class Mew extends PokemonCard {
    tags: CardTag[];
    stage: Stage;
    cardType: CardType;
    hp: number;
    weakness: {
        type: CardType;
    }[];
    retreat: never[];
    powers: {
        name: string;
        powerType: PowerType;
        useWhenInPlay: boolean;
        text: string;
    }[];
    attacks: {
        name: string;
        cost: CardType[];
        damage: number;
        text: string;
    }[];
    set: string;
    cardImage: string;
    setNumber: string;
    name: string;
    fullName: string;
    reduceEffect(store: StoreLike, state: State, effect: Effect): State;
    private buildAttackList;
    private checkAttack;
}
