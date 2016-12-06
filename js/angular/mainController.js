import GameEngine from './../gameEngine';
import MapController from './../map/mapController';
import {GAME_PHASES, TURN_PHASES} from './../gameConstants';
import {getTerritoryByName} from './../map/mapHelpers';

export function MainController($scope, $rootScope, $log, gameEngine) {
    var vm = this;

    // PUBLIC FUNCTIONS
    vm.filterByOwner = filterByOwner;
    vm.filterByRegion = filterByRegion;
    vm.nextTurn = nextTurn;
    vm.checkIfNextIsDisabled = checkIfNextIsDisabled;
    vm.getCurrentPlayerColor = getCurrentPlayerColor;
    vm.init = init;
    vm.startGame = startGame;
    vm.toggleMusicVolume = toggleMusicVolume;
    vm.playMusic = true;

    vm.gamePhases = GAME_PHASES;
    vm.currentGamePhase = GAME_PHASES.PLAYER_SETUP;

    vm.turn = {};

    var mapController;

    function init() {
        setupEvents();
        console.log('Initialization of mainController');
    }

    function toggleMusicVolume() {
        if (vm.playMusic) {
            gameEngine.setMusicVolume(0);
        } else {
            gameEngine.setMusicVolume(1.0);
        }
        vm.playMusic = !vm.playMusic;
    }

    function setupEvents() {
        $rootScope.$on('battleIsOver', function(event, data) {
            gameEngine.setMusic();
            $log.debug('Battle is over ', data);
            // update map in gameEngine by changing owner and numberOfTroops
            let territoryAttacking = getTerritoryByName(gameEngine.map, data.attackFrom.name);

            territoryAttacking.owner = data.attackFrom.owner;
            territoryAttacking.numberOfTroops = data.attackFrom.numberOfTroops === 0 ? 1 : data.attackFrom.numberOfTroops;

            let territoryAttacked = getTerritoryByName(gameEngine.map, data.attackTo.name);

            territoryAttacked.owner = data.attackTo.owner;
            territoryAttacked.numberOfTroops = data.attackTo.numberOfTroops;

            mapController.updateMap(gameEngine.map, vm.filter, gameEngine.turn);

            checkIfPlayerWonTheGame();
        });
    }

    function startGame(players) {
        gameEngine.startGame(players);
        vm.currentGamePhase = vm.gamePhases.GAME;
        vm.troopsToDeploy = gameEngine.troopsToDeploy;

        mapController = new MapController(gameEngine.players, gameEngine.map);
        document.querySelectorAll('.country').forEach(country => {
            country.addEventListener('click', (e) => {
                clickCountry(e);
            });
        });

        vm.turn = gameEngine.turn;
        vm.filter = 'byOwner';
        mapController.updateMap(gameEngine.map, vm.filter, gameEngine.turn);
    }

    function checkIfPlayerWonTheGame() {
        // to do
    }

    function filterByOwner() {
        vm.filter = 'byOwner';
        mapController.updateMap(gameEngine.map, vm.filter, gameEngine.turn);
    }

    function filterByRegion() {
        vm.filter = 'byRegion';
        mapController.updateMap(gameEngine.map, vm.filter, gameEngine.turn);
    }

    function nextTurn() {
        vm.turn = gameEngine.nextTurn();
        mapController.updateMap(gameEngine.map, vm.filter, gameEngine.turn);
        if (vm.turn.turnPhase === TURN_PHASES.DEPLOYMENT) {
            vm.troopsToDeploy = gameEngine.troopsToDeploy;
        }
        console.log(vm.turn);
    }

    function checkIfNextIsDisabled() {
        if (!gameEngine.turn) {
            return;
        }
        if (gameEngine.turn.turnPhase === TURN_PHASES.DEPLOYMENT && gameEngine.troopsToDeploy > 0) {
            return true;
        }
        return false;
    }

    function getCurrentPlayerColor() {
        return gameEngine.players ? gameEngine.players.get(vm.turn.player.name).color.mainColor : '';
    }

    function clickCountry(evt) {
        let country = evt.target.getAttribute('id');
        let clickedTerritory = getTerritoryByName(gameEngine.map, country);

        if (gameEngine.turn.turnPhase === TURN_PHASES.DEPLOYMENT) {
            gameEngine.addTroopToTerritory(country);
            mapController.updateMap(gameEngine.map, vm.filter, gameEngine.turn);
            vm.troopsToDeploy = gameEngine.troopsToDeploy;
            $scope.$apply();
        } else if (gameEngine.turn.turnPhase === TURN_PHASES.ATTACK) {
            if (gameEngine.selectedTerritory &&
                clickedTerritory.owner !== gameEngine.turn.player.name &&
                clickedTerritory.adjacentTerritories.includes(gameEngine.selectedTerritory.name) &&
                gameEngine.selectedTerritory.numberOfTroops > 1) {
                let attack = {
                    territoryAttacked: clickedTerritory,
                    attackFrom: gameEngine.selectedTerritory,
                    attacker: gameEngine.players.get(gameEngine.selectedTerritory.owner),
                    defender: gameEngine.players.get(clickedTerritory.owner)
                };
                gameEngine.setMusic('./audio/bgmusic_attack.mp3');
                $rootScope.$emit('engageAttackPhase', attack);
            } else {
                gameEngine.selectedTerritory = clickedTerritory;
                mapController.updateMap(gameEngine.map, vm.filter, gameEngine.turn);
                mapController.hightlightTerritory(country, vm.turn);
            }
        } else if (gameEngine.turn.turnPhase === TURN_PHASES.MOVEMENT) {
            if (gameEngine.selectedTerritory &&
                gameEngine.selectedTerritory.name === clickedTerritory.name) {
                gameEngine.selectedTerritory = undefined;
                mapController.updateMap(gameEngine.map, vm.filter, gameEngine.turn);
            } else if (gameEngine.selectedTerritory &&
                       clickedTerritory.owner === gameEngine.turn.player.name &&
                       gameEngine.selectedTerritory.numberOfTroops > 1 &&
                       clickedTerritory.name !== gameEngine.selectedTerritory.name) {
                // move troops
            } else {
                gameEngine.selectedTerritory = clickedTerritory;
                mapController.updateMap(gameEngine.map, vm.filter, gameEngine.turn);
                mapController.hightlightTerritory(country, vm.turn);
            }
        }
    }
}
