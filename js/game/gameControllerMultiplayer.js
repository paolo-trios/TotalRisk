const firebase = require('firebase/app');
require('firebase/auth');
require('firebase/database');
const {
    PAUSE_MODES,
    GAME_PHASES,
    TURN_PHASES,
    ATTACK_MUSIC
} = require('./../gameConstants');
const { normalizeTimeFromTimestamp, getRandomColor } = require('./../helpers');
const { displayReinforcementNumbers, displayDamageNumbers } = require('./../animations/animations');
const { getTerritoryByName, getTerritoriesForMovement } = require('./../map/mapHelpers');
const { PLAYER_TYPES } = require('./../player/playerConstants');
const Card = require('./../card/card');

const GameController = require('./gameController');

class GameControllerMultiplayer extends GameController {
    constructor($scope, $rootScope, $sce, $uibModal, $timeout, gameEngine, soundService, mapService, tutorialService, aiHandler, settings, gameAnnouncerService, socketService) {
        super($scope, $rootScope, $sce, $uibModal, $timeout, gameEngine, soundService, mapService, tutorialService, aiHandler, settings, gameAnnouncerService, socketService);

        this.vm.lobbyChatMessage = '';
        this.vm.lobbyChatMessages = [];
        this.vm.globalChatMessage = '';
        this.vm.globalChatMessages = [];
        this.vm.unreadLobbyMessages = 0;
        this.vm.unreadGlobalMessages = 0;
        this.vm.chatMaxLengthMessage = 150;
        this.vm.muteChat = false;
        this.firstLoad = true;
        this.vm.showLobbyChat = true;
        this.vm.timerWidth = 0;

        this.$rootScope.$watch('currentLobby', () => {
            this.vm.currentLobby = this.$rootScope.currentLobby;
        });

        this.globalChatColor = getRandomColor();

        this.vm.isMyTurn = this.isMyTurn;

        this.elementIds = {
            ownageChart: 'ownageChartMultiplayer',
            troopChart: 'troopChartMultiplayer'
        };

        firebase.database().ref('globalChat').on('value', snapshot => {
            if (!this.vm.muteChat && this.$rootScope.currentGamePhase === GAME_PHASES.PLAYER_SETUP_MULTIPLAYER && !this.firstLoad && !this.vm.showLobbyChat) {
                this.soundService.newMessage.play();
            }
            if (this.vm.showLobbyChat && !this.firstLoad) {
                this.vm.unreadGlobalMessages++;
            }
            this.firstLoad = false;
            const messages = snapshot.val();

            this.vm.globalChatMessages = [];
            for (let message in messages) {
                this.vm.globalChatMessages.push(messages[message]);
            }

            this.vm.globalChatMessages.map(message => {
                message.normalizedTime = normalizeTimeFromTimestamp(message.timestamp);
            });

            this.vm.globalChatMessages.sort((a, b) => {
                return a.timestamp - b.timestamp;
            });

            // Get last 100
            this.vm.globalChatMessages = this.vm.globalChatMessages.slice(this.vm.globalChatMessages.length - 100, this.vm.globalChatMessages.length);

            console.log('Global chat messags', this.vm.globalChatMessages);
            this.$timeout(() => {
                this.$scope.$apply();
                document.querySelectorAll('.chatMessagesContainer').forEach(el => {
                    el.scrollTop = el.scrollHeight;
                });
            }, 1);
        });
    }

    switchChat(showLobbyChat) {
        this.vm.showLobbyChat = showLobbyChat;
        if (this.vm.showLobbyChat) {
            this.vm.unreadLobbyMessages = 0;
        } else {
            this.vm.unreadGlobalMessages = 0;
        }
        this.$timeout(() => {
            document.querySelectorAll('.chatMessagesContainer').forEach(el => {
                el.scrollTop = el.scrollHeight;
            });
        }, 20);
    }

    charactersLeft () {
        return this.vm.showLobbyChat
            ? (this.vm.chatMaxLengthMessage - this.vm.lobbyChatMessage.length)
            : (this.vm.chatMaxLengthMessage - this.vm.globalChatMessage.length);
    }

    sendMessageLobby() {
        this.vm.disableSendButton = true;
        this.$timeout(() => {
            this.vm.disableSendButton = false;
        }, 1000);

        if (!this.vm.muteChat) {
            this.soundService.tick.play();
        }
        const user = firebase.auth().currentUser;
        const userName = user.displayName ? user.displayName : user.email;

        this.socketService.gameSocket.emit('sendMessage', this.vm.currentLobby.id, {
            sender: userName,
            uid: user.uid,
            message: this.vm.lobbyChatMessage,
            timestamp: Date.now()
        });

        this.vm.lobbyChatMessage = '';
    }

    sendMessageGlobal() {
        this.vm.disableSendButton = true;
        this.$timeout(() => {
            this.vm.disableSendButton = false;
        }, 1000);

        if (!this.vm.muteChat) {
            this.soundService.tick.play();
        }
        const id = Math.floor((Math.random() * 100000000000) + 1);
        const user = firebase.auth().currentUser;
        const creator = user.displayName ? user.displayName : user.email;
        const message = this.vm.globalChatMessage;
        this.vm.globalChatMessage = '';
        firebase.database().ref('globalChat/' + id).set({
            timestamp: Date.now(),
            creator,
            creatorUid: user.uid,
            message,
            color: this.globalChatColor
        });
    }

    nextTurn() {
        if (this.checkIfNextIsDisabled()) {
            this.soundService.denied.play();
            return;
        }
        this.socketService.gameSocket.emit('nextTurn');
    }

    isMyTurn() {
        return this.gameEngine.turn && this.gameEngine.turn.player.userUid === this.vm.myUid;
    }

    turnInCards() {
        if (!this.isMyTurn() || this.gameEngine.turn.turnPhase !== TURN_PHASES.DEPLOYMENT) {
            return;
        }

        this.soundService.tick.play();

        this.$uibModal.open({
            templateUrl: 'src/modals/cardTurnInModal.html',
            backdrop: 'static',
            windowClass: 'riskModal cardTurnInModalWrapper',
            controller: 'cardTurnInModalController',
            controllerAs: 'cardTurnIn',
            resolve: {
                data: () => {
                    return {
                        type: 'normal'
                    };
                }
            }
        }).result.then(closeResponse => {
            if (closeResponse && closeResponse.newTroops) {
                this.socketService.gameSocket.emit('cardTurnIn', closeResponse.newTroops, closeResponse.newHand.map(c => ({
                    territoryName: c.territoryName,
                    cardType: c.cardType,
                    regionName: c.regionName
                })));
            }
        });
    }

    engageAttackPhase(clickedTerritory) {
        this.$uibModal.open({
            templateUrl: 'src/modals/attackModal.html',
            backdrop: 'static',
            windowClass: 'riskModal attackModalWrapper',
            controller: 'attackModalController',
            controllerAs: 'attack',
            keyboard: false,
            resolve: {
                attackData: () => {
                    return {
                        territoryAttacked: clickedTerritory,
                        attackFrom: this.gameEngine.selectedTerritory,
                        attacker: this.gameEngine.players.get(this.gameEngine.selectedTerritory.owner),
                        defender: this.gameEngine.players.get(clickedTerritory.owner),
                        multiplayer: true
                    };
                }
            }
        }).result.then(closeResponse => {
            this.gameEngine.setMusic();
            console.log('Battle is over ', closeResponse);
            this.updateChartData();
        });
    }

    setCurrentGamePhaseWatcher() {
        this.$rootScope.$watch('currentGamePhase', () => {
            if (this.$rootScope.currentGamePhase === GAME_PHASES.GAME_MULTIPLAYER) {
                this.initiateTimer();

                const user = firebase.auth().currentUser;
                this.vm.myUid = user.uid;
                this.mapService.init('multiplayerMap', true, this.vm.myUid);
                this.setListeners();
                this.startGame(this.$rootScope.players, this.$rootScope.chosenGoal);
                this.setSocketListeners();
                this.socketService.gameSocket.emit('getMessages');
                this.vm.troopsToDeploy = this.gameEngine.troopsToDeploy;
                this.mapService.updateMapForMultiplayer(this.gameEngine.filter, this.vm.myUid);
            }
        });
    }

    clickCountry(evt) {
        if (this.gameEngine.turn.player.type !== PLAYER_TYPES.HUMAN || !this.isMyTurn()) {
            return;
        }

        let country = evt.target.getAttribute('id');
        if (!country) {
            country = evt.target.getAttribute('for');
        }
        const clickedTerritory = getTerritoryByName(this.gameEngine.map, country);

        if (this.gameEngine.turn.turnPhase === TURN_PHASES.DEPLOYMENT) {
            if (this.gameEngine.troopsToDeploy > 0 && clickedTerritory.owner === this.gameEngine.turn.player.name) {
                // this.soundService.addTroopSound.play();
                displayReinforcementNumbers(clickedTerritory.name);

                this.socketService.gameSocket.emit('troopAddedToTerritory', clickedTerritory.name);
            } else {
                this.soundService.denied.play();
            }
        } else if (this.gameEngine.turn.turnPhase === TURN_PHASES.ATTACK) {
            if (this.gameEngine.selectedTerritory &&
                clickedTerritory.owner !== this.gameEngine.turn.player.name &&
                clickedTerritory.adjacentTerritories.includes(this.gameEngine.selectedTerritory.name) &&
                this.gameEngine.selectedTerritory.numberOfTroops > 1) {

                this.gameEngine.setMusic(ATTACK_MUSIC);
                this.engageAttackPhase(clickedTerritory);
            } else {
                this.gameEngine.selectedTerritory = clickedTerritory;
                this.mapService.updateMapForMultiplayer(this.gameEngine.filter, this.vm.myUid);
                this.mapService.hightlightTerritory(country);
            }
        } else if (this.gameEngine.turn.turnPhase === TURN_PHASES.MOVEMENT) {
            if (this.gameEngine.selectedTerritory &&
                this.gameEngine.selectedTerritory.name === clickedTerritory.name) {
                this.gameEngine.selectedTerritory = undefined;
                this.mapService.updateMapForMultiplayer(this.gameEngine.filter, this.vm.myUid);
            } else if (this.gameEngine.selectedTerritory &&
                       clickedTerritory.owner === this.gameEngine.turn.player.name &&
                       this.gameEngine.selectedTerritory.numberOfTroops > 1 &&
                       clickedTerritory.name !== this.gameEngine.selectedTerritory.name &&
                       getTerritoriesForMovement(this.gameEngine.selectedTerritory, this.gameEngine.map).includes(clickedTerritory.name)) {
                // move troops
                this.engageMovementPhase(clickedTerritory);
            } else {
                this.gameEngine.selectedTerritory = clickedTerritory;
                this.mapService.updateMapForMultiplayer(this.gameEngine.filter, this.vm.myUid);
                if (this.gameEngine.selectedTerritory.numberOfTroops > 1) {
                    this.mapService.hightlightTerritory(country);
                }
            }
        }
    }

    checkIfNextIsDisabled() {
        if (!this.gameEngine.turn) {
            return;
        }
        if (!this.isMyTurn()) {
            return true;
        }
        if (this.gameEngine.turn.turnPhase === TURN_PHASES.DEPLOYMENT && this.gameEngine.troopsToDeploy > 0) {
            return true;
        }
        return false;
    }

    updateGameAfterMovement(closeResponse) {
        const movementFromTerritory = getTerritoryByName(this.gameEngine.map, closeResponse.from.name);
        movementFromTerritory.numberOfTroops = closeResponse.from.numberOfTroops === 0 ? 1 : closeResponse.from.numberOfTroops;

        const movementToTerritory = getTerritoryByName(this.gameEngine.map, closeResponse.to.name);
        movementToTerritory.numberOfTroops = closeResponse.to.numberOfTroops;

        this.socketService.gameSocket.emit('updateMovement', movementFromTerritory.name, movementFromTerritory.numberOfTroops, movementToTerritory.name, movementToTerritory.numberOfTroops);

        this.mapService.updateMapForMultiplayer(this.gameEngine.filter, this.vm.myUid);
    }

    initiateTimer() {
        clearInterval(this.turnTimer);
        const turnLength = this.$rootScope.turnLength;
        const turnLengthMs = (turnLength * 1000);
        this.turnTimerSeconds = turnLengthMs;
        this.turnTimerFunction = () => {
            this.turnTimerSeconds -= 100;
            const totalWidth = $('#timerBar').width();
            const widthPercentage = (this.turnTimerSeconds === 0) ? 100 : ((turnLengthMs - this.turnTimerSeconds) / turnLengthMs);
            this.vm.timerWidth = Math.floor(widthPercentage * totalWidth);
            this.vm.secondsLeft = Math.floor(this.turnTimerSeconds / 1000);

            this.$scope.$apply();
            if (this.turnTimerSeconds <= 0) {
                clearInterval(this.turnTimer);
            }
        };
        this.turnTimer = setInterval(this.turnTimerFunction, 100);
    }

    openPauseModal() {
        this.startMenuIsOpen = true;
        if (this.aiTurn && this.vm.gamePaused !== PAUSE_MODES.PAUSED) {
            this.vm.gamePaused = PAUSE_MODES.PAUSED;
        }

        this.$uibModal.open({
            templateUrl: 'src/modals/pauseMenuModal.html',
            backdrop: 'static',
            windowClass: 'riskModal pauseMenuModal',
            controller: 'pauseMenuModalController',
            controllerAs: 'pauseMenu',
            keyboard: false,
            resolve: {
                multiplayer: () => true
            }
        }).result.then(closeResponse => {
            if (this.aiTurn && this.vm.gamePaused === PAUSE_MODES.PAUSED) {
                this.vm.gamePaused = PAUSE_MODES.NOT_PAUSED;
            }
            this.startMenuIsOpen = false;
            this.escapeWasPressed = false;
        });
    }

    setSocketListeners() {
        this.socketService.gameSocket.on('playerWonNotifier', (endScreenData) => {
            console.log('A player won', endScreenData);

            this.vm.playerWhoWon = this.gameEngine.players.get(endScreenData.winner);

            endScreenData.stats.forEach(s => {
                this.gameEngine.players.get(s.name).statistics = s.statistics;
            });

            this.$rootScope.endScreenData = endScreenData;
            this.$rootScope.currentGamePhase = GAME_PHASES.END_SCREEN;
        });

        this.socketService.gameSocket.on('newReinforcements', newTroops => {
            this.soundService.cardTurnIn.play();
            for (let i = 0; i < newTroops; i++) {
                setTimeout(() => {
                    this.gameEngine.troopsToDeploy++;
                    this.vm.troopsToDeploy = this.gameEngine.troopsToDeploy;
                    this.$scope.$apply();
                }, (i * 50));
            }
        });

        this.socketService.gameSocket.on('updatedCardsForPlayer', (ownerUid, cards) => {
            this.soundService.cardSelect.play();
            const playerName = Array.from(this.gameEngine.players.values()).find(x => x.userUid === ownerUid).name;

            const newCards = [];

            cards.forEach(c => {
                newCards.push(new Card(c.territoryName, c.cardType, c.regionName));
            });

            this.gameEngine.players.get(playerName).cards = newCards;

            this.gameEngine.turn.player.cards = newCards;
            this.vm.turn = this.gameEngine.turn;
        });

        this.socketService.gameSocket.on('updateMapState', territories => {
            this.gameEngine.map.getAllTerritoriesAsList().forEach(t => {
                const territoryFromServer = territories.find(x => x.name === t.name);
                t.owner = territoryFromServer.owner;
                t.numberOfTroops = territoryFromServer.numberOfTroops;
            });
            this.mapService.updateMapForMultiplayer(this.gameEngine.filter, this.vm.myUid);
            this.$scope.$apply();
        });

        this.socketService.gameSocket.on('troopAddedToTerritoryNotifier', (territoryName) => {
            this.gameEngine.addTroopToTerritory(territoryName);
            this.vm.troopsToDeploy = this.gameEngine.troopsToDeploy;
            this.$scope.$apply();

            this.updateChartData();

            this.soundService.addTroopSound.play();
            displayReinforcementNumbers(territoryName);

            this.mapService.updateMapForMultiplayer(this.gameEngine.filter, this.vm.myUid);
        });

        this.socketService.gameSocket.on('nextTurnNotifier', (turn, reinforcementData) => {
            if (turn.newPlayer && turn.player.type === PLAYER_TYPES.HUMAN) {
                this.initiateTimer();
            } else if (turn.newPlayer && turn.player.type === PLAYER_TYPES.AI) {
                clearInterval(this.turnTimer);
            }

            this.gameEngine.turn = turn;
            this.vm.turn = this.gameEngine.turn;
            if (reinforcementData) {
                this.gameEngine.reinforcementData = reinforcementData;
                this.gameEngine.troopsToDeploy = reinforcementData.totalReinforcements;
                this.vm.troopsToDeploy = this.gameEngine.reinforcementData.totalReinforcements;
            }
            this.$scope.$apply();

            this.soundService.tick.play();

            if (this.settings.showAnnouncer) {
                this.turnPresenterIsOpen = true;
                this.$uibModal.open({
                    templateUrl: 'src/modals/turnPresentationModal.html',
                    backdrop: 'static',
                    windowClass: 'riskModal turnPresentationModalWrapper',
                    controller: 'turnPresentationController',
                    controllerAs: 'turnPresentation',
                    keyboard: false,
                    resolve: {
                        data: () => {
                            return {
                                type: 'newTurn'
                            };
                        }
                    }
                }).result.then(closeResponse => {
                    this.mapService.updateMapForMultiplayer(this.gameEngine.filter, this.vm.myUid);
                    this.turnPresenterIsOpen = false;
                    this.vm.currentOwnagePercentage = this.gameEngine.standings.find(x => x.name === this.gameEngine.turn.player.name).percentageOwned;
                    if (this.escapeWasPressed) {
                        this.openPauseModal();
                    }
                });
            } else {
                this.mapService.updateMapForMultiplayer(this.gameEngine.filter, this.vm.myUid);
                this.vm.currentOwnagePercentage = this.gameEngine.standings.find(x => x.name === this.gameEngine.turn.player.name).percentageOwned;
            }
        });

        this.socketService.gameSocket.on('battleFoughtNotifier', (battleData) => {
            console.log('battleData',battleData);

            getTerritoryByName(this.gameEngine.map, battleData.attackerTerritory).numberOfTroops = battleData.attackerNumberOfTroops;
            getTerritoryByName(this.gameEngine.map, battleData.defenderTerritory).numberOfTroops = battleData.defenderNumberOfTroops;

            if (battleData.attackerCasualties) {
                displayDamageNumbers(battleData.attackerTerritory, battleData.attackerCasualties);
            }
            if (battleData.defenderCasualties) {
                displayDamageNumbers(battleData.defenderTerritory, battleData.defenderCasualties);
            }
            if (battleData.attackerCasualties || battleData.defenderCasualties) {
                this.soundService.muskets.play();
            }

            this.mapService.updateMapForMultiplayer(this.gameEngine.filter, this.vm.myUid);

            this.updateChartData();
        });

        this.socketService.gameSocket.on('updateOwnerAfterSuccessfulInvasionNotifier', (updateOwnerData) => {
            getTerritoryByName(this.gameEngine.map, updateOwnerData.attackerTerritory).numberOfTroops = updateOwnerData.attackerTerritoryNumberOfTroops;
            getTerritoryByName(this.gameEngine.map, updateOwnerData.defenderTerritory).numberOfTroops = updateOwnerData.defenderTerritoryNumberOfTroops;
            getTerritoryByName(this.gameEngine.map, updateOwnerData.defenderTerritory).owner = updateOwnerData.owner;

            this.mapService.updateMapForMultiplayer(this.gameEngine.filter, this.vm.myUid);
            this.soundService.movement.play();

            this.updateChartData();
        });

        this.socketService.gameSocket.on('updateMovementNotifier', (map) => {
            this.gameEngine.map.getAllTerritoriesAsList().forEach(t => {
                const territoryFromServer = map.find(x => x.name === t.name);
                t.owner = territoryFromServer.owner;
                t.numberOfTroops = territoryFromServer.numberOfTroops;
            });
        });

        this.socketService.gameSocket.on('messagesUpdated', (messages) => {
            if (!this.vm.muteChat && this.$rootScope.currentGamePhase === GAME_PHASES.GAME_MULTIPLAYER && this.vm.showLobbyChat) {
                this.soundService.newMessage.play();
            }

            if (!this.vm.showLobbyChat) {
                this.vm.unreadLobbyMessages++;
            }

            this.vm.lobbyChatMessages = messages;
            this.vm.lobbyChatMessages.map(message => {
                message.normalizedTime = normalizeTimeFromTimestamp(message.timestamp);
            });
            this.$scope.$apply();

            this.$timeout(() => {
                document.querySelectorAll('.chatMessagesContainer').forEach(el => {
                    el.scrollTop = el.scrollHeight;
                });
            }, 20);

            console.log('Lobby messages', this.vm.lobbyChatMessages);
        });
    }

}

module.exports = GameControllerMultiplayer;