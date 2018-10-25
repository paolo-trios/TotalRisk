import { GAME_PHASES } from './../gameConstants';
import { getCurrentOwnershipStandings } from './../map/mapHelpers';

export default class EndScreenTableController {
    constructor($scope, $rootScope, gameEngine) {
        this.vm = this;
        this.$rootScope = $rootScope;
        this.gameEngine = gameEngine;

        this.$rootScope.$watch('currentGamePhase', () => {
            if (this.$rootScope.currentGamePhase === GAME_PHASES.END_SCREEN) {
                console.log(this.gameEngine.players);
                this.calculateRankings();
            }
        });
    }

    calculateRankings() {
        this.players = Array.from(this.gameEngine.players.values());
        const ownership = getCurrentOwnershipStandings(this.gameEngine.map, this.gameEngine.players);

        this.players.sort((a, b) => {
            if (a.name === this.gameEngine.playerWhoWon) {
                return -1;
            } else if (a.dead && b.dead) {
                return a.deadTurn > b.deadTurn ? -1 : 1;
            } else if (a.dead) {
                return 1;
            } else if (b.dead) {
                return -1;
            } else {
                let aTotal = ownership.find(x => x.name === a.name).totalTerritories;
                let bTotal = ownership.find(x => x.name === b.name).totalTerritories;

                if (aTotal > bTotal) {
                    return -1;
                } else if (aTotal < bTotal) {
                    return 1;
                } else if (aTotal === bTotal) {
                    aTotal = ownership.find(x => x.name === a.name).totalTroops;
                    bTotal = ownership.find(x => x.name === b.name).totalTroops;

                    if (aTotal > bTotal) {
                        return -1;
                    } else if (aTotal < bTotal) {
                        return 1;
                    } else {
                        return 0;
                    }
                }
            }
        });

        this.players.map(x => {
            x.rank = (this.players.indexOf(x) + 1);
        });

        this.vm.players = this.players;

    }
}