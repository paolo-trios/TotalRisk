const BattleHandler = require('./battleHandler');
const {delay} = require('./../helpers');
const {GAME_PHASES} = require('./../gameConstants');

class AttackModalController {
    constructor($scope, $rootScope, $uibModalInstance, soundService, tutorialService, attackData, socketService, gameEngine) {
        this.vm = this;

        // PUBLIC FIELDS
        this.vm.attackerDice = [];
        this.vm.defenderDice = [];
        this.vm.fightIsOver = false;
        this.vm.showMoveTroops = false;
        this.vm.disableButtons = false;

        this.vm.moveNumberOfTroops = 1;
        this.vm.movementSliderOptions = {};

        this.vm.countrySvg = '';

        this.vm.diceAreRolling = false;
        this.vm.loading = true;

        // PUBLIC FUNCTIONS
        this.vm.fight = this.fight;
        this.vm.blitzFight = this.blitzFight;
        this.vm.retreat = this.retreat;
        this.vm.moveTroops = this.moveTroops;
        this.vm.convertTroopAmountToTroopTypes = this.convertTroopAmountToTroopTypes;
        this.vm.getAsArray = this.getAsArray;

        this.$scope = $scope;
        this.$rootScope = $rootScope;
        this.$uibModalInstance = $uibModalInstance;
        this.soundService = soundService;
        this.attackData = attackData;
        this.tutorialService = tutorialService;
        this.socketService = socketService;
        this.gameEngine = gameEngine;

        this.vm.battleHandler = new BattleHandler();

        console.log('Initialization of AttackModalController');
        console.log('Attack: ', attackData);
        this.vm.attacker = attackData.attackFrom;
        this.vm.attacker.color = attackData.attacker.color;
        this.vm.attacker.avatar = attackData.attacker.avatar;
        this.vm.attacker.numberOfTroops--;
        this.vm.defender = attackData.territoryAttacked;
        this.vm.defender.color = attackData.defender.color;
        this.vm.defender.avatar = attackData.defender.avatar;

        // Close the modal on escape if in tutorial mode
        this.boundListener = evt => this.keyupEventListener(evt);
        document.addEventListener('keyup', this.boundListener);

        this.vm.attackerTotalCasualites = 0;
        this.vm.defenderTotalCasualites = 0;

        this.getCountrySvgDelay = 500;
        this.moveTroopsDelay = 2500;
        this.closeModalDelay = 2500;
        this.startShakeAnimationDelay = 100;
        this.stopShakeAnimationDelay = 500;
        this.tutorialDelayAfterStartAttack = 2500;

        this.multiplayerMode = this.attackData.multiplayer;

        if (this.multiplayerMode) {
            // display territories in battle for other players

            this.socketService.gameSocket.on('skipToNextPlayer', () => {
                this.retreat();
            });
        }

        const defendingNationName = this.vm.defender.name;
        setTimeout(() => {
            this.getCountrySvg(defendingNationName);

            const attackerCanvas = document.getElementById('attackerCanvas');
            const defenderCanvas = document.getElementById('defenderCanvas');
            this.attacker_box = new dice_box(attackerCanvas, { w: 440, h: 200 }, {
                dice_color: '#6b0a05'
            });
            this.defender_box = new dice_box(defenderCanvas, { w: 440, h: 200 }, {
                dice_color: '#061a7f'
            });

            $('#territoryContainer').animate({
                opacity: 1
            }, 400);

            $('#diceContainer').animate({
                height: '202px'
            }, 400, () => {
                $('#diceContainer').animate({
                    opacity: 1
                }, 400, () => {
                    this.vm.loading = false;
                    this.$scope.$apply();
                    if (attackData.tutorialMode) {
                        this.tutorial = this.attackData.tutorialMode;
                        this.runTutorial();
                    }
                });
            });

        }, this.getCountrySvgDelay);
    }

    keyupEventListener(e) {
        if (e.keyCode === 27) { // Escape
            if (this.$rootScope.currentGamePhase !== GAME_PHASES.GAME) {
                this.$uibModalInstance.close();
                document.removeEventListener('keyup', this.boundListener);
            }
        }
    }

    runTutorial() {
        this.tutorialService.initTutorialData();
        this.tutorialService.attackModalExplanation()
            .then(() => this.tutorialService.attackModalFightExplanation())
            .then(() => this.tutorialService.attackModalRetreatExplanation())
            .then(() => this.tutorialService.startAttack(this.attackData))
            .then(() => {
                this.fight([6, 4, 2], [3]);
                return delay(this.tutorialDelayAfterStartAttack);
            })
            .then(() => this.tutorialService.afterAttack(this.attackData))
            .then(() => this.tutorialService.afterAttack2(this.attackData))
            .then(() => this.tutorialService.moveAfterAttackExplanation(this.attackData))
            .then(() => {
                return new Promise(resolve => {
                    this.vm.moveNumberOfTroops = this.vm.attacker.numberOfTroops;
                    this.$scope.$apply();
                    resolve();
                });
            })
            .then(() => {
                this.moveTroops();
            })
            .catch((error) => {
                console.log('Attack modal error', error);
            });
    }

    blitzFight() {
        this.vm.diceAreRolling = true;
        this.vm.isBlitzFight = true;
        this.fight();
    }

    fight(preDeterminedAttackDice = null, preDeterminedDefendDice = null) {
        this.soundService.diceRoll.play();
        this.vm.diceAreRolling = true;

        const response = this.vm.battleHandler.handleAttack(this.vm.attacker, this.vm.defender, preDeterminedAttackDice, preDeterminedDefendDice);
        this.vm.attackerDice = response.attackDice;
        this.vm.defenderDice = response.defendDice;
        this.battleHandlerResponse = response;

        this.numberOfRollsComplete = 0;

        this.attacker_box.throw(this.vm.attackerDice, this.afterRoll, this);
        this.defender_box.throw(this.vm.defenderDice, this.afterRoll, this);
    }

    battleFought(attackerCasualties, defenderCasualties, attackerNumberOfTroops, defenderNumberOfTroops) {
        if (!this.multiplayerMode) {
            return;
        }
        if (this.multiplayerMode) {
            this.socketService.gameSocket.emit('battleFought', {
                attackerCasualties,
                defenderCasualties,
                attackerNumberOfTroops: (attackerNumberOfTroops + 1),
                defenderNumberOfTroops,
                defenderTerritory: this.vm.defender.name,
                attackerTerritory: this.vm.attacker.name
            });
        }
    }

    afterRoll(result, context) {
        context.numberOfRollsComplete++;
        if (context.numberOfRollsComplete !== 2) {
            return;
        }

        // If one player loses 2 troops a scream sound is heard
        if (context.battleHandlerResponse.defenderCasualties === 2 || context.battleHandlerResponse.attackerCasualties === 2) {
            context.soundService.screamSound.play();
        }

        context.vm.attackerTotalCasualites += context.battleHandlerResponse.attackerCasualties;
        context.vm.defenderTotalCasualites += context.battleHandlerResponse.defenderCasualties;

        context.vm.attacker = context.battleHandlerResponse.attacker;
        context.vm.defender = context.battleHandlerResponse.defender;
        context.vm.attackerCasualties = context.battleHandlerResponse.attackerCasualties;
        context.vm.defenderCasualties = context.battleHandlerResponse.defenderCasualties;

        context.battleFought(
            context.battleHandlerResponse.attackerCasualties,
            context.battleHandlerResponse.defenderCasualties,
            context.vm.attacker.numberOfTroops,
            context.vm.defender.numberOfTroops
        );

        context.vm.diceAreRolling = false;

        if (context.vm.attacker.numberOfTroops === 0 || context.vm.defender.numberOfTroops === 0) {
            context.vm.isBlitzFight = false;

            // the invasion failed
            context.vm.fightIsOver = true;
            if (context.vm.defender.numberOfTroops === 0) {
                // the invasion succeded
                context.$scope.$apply();
                context.soundService.cheer.play();
                $('#attackerTroops .troopIcon svg').addClass('animated infinite bounce');

                if (context.vm.attacker.numberOfTroops > 3) {
                    context.vm.moveNumberOfTroops = 3;
                    context.vm.movementSliderOptions = {
                        floor: 3,
                        ceil: context.vm.attacker.numberOfTroops,
                        showTicks: true
                    };
                    context.vm.showMoveTroops = true;
                    context.$scope.$apply();
                } else if (!context.tutorial) {
                    setTimeout(() => {
                        context.vm.moveNumberOfTroops = context.vm.attacker.numberOfTroops;
                        context.moveTroops();
                    }, context.moveTroopsDelay);
                }
            }
            if (context.vm.attacker.numberOfTroops === 0) {
                context.$scope.$apply();
                $('#defenderTroops .troopIcon svg').addClass('animated infinite bounce');
                setTimeout(() => {
                    context.closeModal(false);
                }, context.closeModalDelay);
            }
        } else {
            context.vm.disableButtons = true;
            if (context.vm.isBlitzFight) {
                setTimeout(() => {
                    context.$scope.$apply();
                    context.vm.disableButtons = false;
                    context.blitzFight();
                }, context.startShakeAnimationDelay);
            } else {
                setTimeout(() => {
                    // Animate shake effect on side(s) affected by casualties
                    let icons;
                    if (context.defenderCasualties > context.attackerCasualties) {
                        icons = $('#defenderTroops .troopIcon');
                    } else if (context.attackerCasualties > context.defenderCasualties) {
                        icons = $('#attackerTroops .troopIcon');
                    } else if (context.attackerCasualties === context.defenderCasualties) {
                        icons = $('.troopIcon');
                    }
                    icons.addClass('shake shake-constant');

                    setTimeout(() => {
                        icons.removeClass('shake shake-constant');
                        context.vm.disableButtons = false;
                        context.$scope.$apply();
                    }, context.stopShakeAnimationDelay);
                }, context.startShakeAnimationDelay);
            }
        }
    }

    closeModal(battleWasWon, retreat = false) {
        const response = {
            attackFrom: Object.assign({}, this.vm.attacker),
            attackTo: Object.assign({}, this.vm.defender),
            battleWasWon,
            previousOwner: this.vm.previousOwner,
            retreat,
            attackerTotalCasualites: this.vm.attackerTotalCasualites,
            defenderTotalCasualites: this.vm.defenderTotalCasualites
        };

        this.$uibModalInstance.close(response);
    }

    moveTroops() {
        this.vm.previousOwner = this.vm.defender.owner;
        this.vm.defender.owner = this.vm.attacker.owner;
        this.vm.attacker.numberOfTroops = this.vm.attacker.numberOfTroops - this.vm.moveNumberOfTroops + 1;
        this.vm.defender.numberOfTroops = this.vm.moveNumberOfTroops;

        const response = {
            attackFrom: Object.assign({}, this.vm.attacker),
            attackTo: Object.assign({}, this.vm.defender),
            battleWasWon: true,
            previousOwner: this.vm.previousOwner,
            retreat: false,
            attackerTotalCasualites: this.vm.attackerTotalCasualites,
            defenderTotalCasualites: this.vm.defenderTotalCasualites
        };

        if (this.multiplayerMode) {
            this.socketService.gameSocket.emit('updateStatisticAfterInvasion', response);

            this.socketService.gameSocket.emit('updateOwnerAfterSuccessfulInvasion', {
                attackerTerritory: this.vm.attacker.name,
                defenderTerritory: this.vm.defender.name,
                attackerTerritoryNumberOfTroops: this.vm.attacker.numberOfTroops,
                defenderTerritoryNumberOfTroops: this.vm.defender.numberOfTroops,
                owner: this.vm.attacker.owner,
                previousOwner: this.vm.previousOwner,
                ownerUid: this.gameEngine.players.get(this.vm.attacker.owner).userUid
            });
        }

        this.$uibModalInstance.close(response);
    }

    retreat() {
        this.vm.attacker.numberOfTroops++;
        this.closeModal(false, true);
    }

    getAsArray(numberOfTroops) {
        return new Array(numberOfTroops);
    }

    convertTroopAmountToTroopTypes(troops) {
        if (!troops) {
            return [];
        }
        const cannons = Math.floor(troops / 10);
        troops -= (cannons * 10);
        const horses = Math.floor(troops / 5);
        troops -= (horses * 5);

        const array = Array.from(new Array(cannons + horses + troops));
        array.fill('cannon', 0, cannons);
        array.fill('horse', cannons, (cannons + horses));
        array.fill('troop', (cannons + horses), (cannons + horses + troops));

        return array;
    }

    getCountrySvg(territoryName) {
        let mapContainer = 'map';
        if (this.attackData.tutorialMode) {
            mapContainer = 'tutorialMap';
        } else if (this.multiplayerMode) {
            mapContainer = 'multiplayerMap';
        }

        const territorySvg = $(`#${mapContainer} #svgMap .country[id='${territoryName}']`).clone();
        territorySvg.removeClass('attackCursor highlighted');
        $('#territorySvg').html(territorySvg);

        const svg = document.getElementById('territorySvg');
        if (svg) {
            const bB = svg.getBBox();
            document.getElementById('territorySvg').setAttribute('viewBox', `${bB.x},${bB.y},${bB.width},${bB.height}`);
        }
    }
}

module.exports = AttackModalController;