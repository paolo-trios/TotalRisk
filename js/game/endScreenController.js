const {
    GAME_PHASES
} = require('./../gameConstants');
const {
    getCurrentOwnershipStandings
} = require('./../map/mapHelpers');
const {
    loadSvgIntoDiv,
    runningElectron
} = require('./../helpers');
const {
    initGlobe
} = require('./../libs/globe');

class EndScreenController {
    constructor($scope, $rootScope, $sce, gameEngine, toastService) {
        this.vm = this;
        this.$scope = $scope;
        this.$rootScope = $rootScope;
        this.$sce = $sce;
        this.gameEngine = gameEngine;
        this.toastService = toastService;

        this.vm.runningElectron = runningElectron();

        this.vm.takeScreenshot = this.takeScreenshot;

        if (ipcRenderer) {
            const that = this;
            ipcRenderer.on('takeScreenshotResponse', function(event, imagePath) {
                that.toastService.successToast('Screenshot taken!', `Written file to ${imagePath}`);
                that.vm.disableScreenshotButton = false;
                that.$scope.$apply();
            });
            ipcRenderer.on('takeScreenshotError', function(event) {
                that.toastService.errorToast('Error!', 'Screenshot could not be taken');
                that.vm.disableScreenshotButton = false;
                that.$scope.$apply();
            });
        }

        this.$rootScope.$watch('currentGamePhase', () => {
            if (this.$rootScope.currentGamePhase === GAME_PHASES.END_SCREEN) {
                if (this.$rootScope.endScreenData && this.$rootScope.endScreenData.playersAsList) {
                    // Multiplayer
                    this.vm.multiplayer = true;
                    this.vm.players = $rootScope.endScreenData.playersAsList;
                    this.vm.players.forEach(player => {
                        const newRating = Math.floor(player.newRating.mu * 100);
                        const oldRating = Math.floor(player.oldRating.mu * 100);
                        player.ratingDifference = newRating - oldRating;
                        player.ratingTooltip = this.$sce.trustAsHtml(`
                            <div class="ratingTooltip">
                                From <strong>${oldRating}</strong> to <strong>${newRating}</strong>
                            </div>
                        `);
                    });
                } else {
                    // Singleplayer
                    this.vm.multiplayer = false;
                    this.calculateRankings();
                    this.vm.players.forEach((x, i) => {
                        x.rank = (i + 1);
                    });
                }

                console.log('End screen players: ', this.vm.players);

                const svgElements = ['firstPlaceContainer', 'secondPlaceContainer', 'thirdPlaceContainer'];
                this.vm.players.slice(0, 3).forEach((player, index) => {
                    if (player.avatar.svg) {
                        loadSvgIntoDiv(player.avatar.svg, `.podiumSvgContainer#${svgElements[index]}`);
                    } else if (player.avatar.customCharacter) {
                        loadSvgIntoDiv('assets/avatarSvg/custom.svg', `.podiumSvgContainer#${svgElements[index]}`, () => {
                            const character = player.avatar;
                            $(`.podiumSvgContainer#${svgElements[index]} svg g[category="hat"] > g`).css('visibility', 'hidden');
                            $(`.podiumSvgContainer#${svgElements[index]} svg g[category="head"] > g`).css('visibility', 'hidden');
                            $(`.podiumSvgContainer#${svgElements[index]} svg g[category="eyes"] > g`).css('visibility', 'hidden');
                            $(`.podiumSvgContainer#${svgElements[index]} svg g[category="eyebrows"] > g`).css('visibility', 'hidden');
                            $(`.podiumSvgContainer#${svgElements[index]} svg g[category="nose"] > g`).css('visibility', 'hidden');
                            $(`.podiumSvgContainer#${svgElements[index]} svg g[category="mouth"] > g`).css('visibility', 'hidden');
                            $(`.podiumSvgContainer#${svgElements[index]} svg g[category="torso"] > g`).css('visibility', 'hidden');
                            $(`.podiumSvgContainer#${svgElements[index]} svg g[category="legs"] > g`).css('visibility', 'hidden');

                            $(`.podiumSvgContainer#${svgElements[index]} svg g[category="hat"] > g[name="${character.hat}"]`).css('visibility', 'visible');
                            $(`.podiumSvgContainer#${svgElements[index]} svg g[category="head"] > g[name="${character.head}"]`).css('visibility', 'visible');
                            $(`.podiumSvgContainer#${svgElements[index]} svg g[category="eyebrows"] > g[name="${character.eyebrows}"]`).css('visibility', 'visible');
                            $(`.podiumSvgContainer#${svgElements[index]} svg g[category="eyes"] > g[name="${character.eyes}"]`).css('visibility', 'visible');
                            $(`.podiumSvgContainer#${svgElements[index]} svg g[category="nose"] > g[name="${character.nose}"]`).css('visibility', 'visible');
                            $(`.podiumSvgContainer#${svgElements[index]} svg g[category="mouth"] > g[name="${character.mouth}"]`).css('visibility', 'visible');
                            $(`.podiumSvgContainer#${svgElements[index]} svg g[category="torso"] > g[name="${character.torso}"]`).css('visibility', 'visible');
                            $(`.podiumSvgContainer#${svgElements[index]} svg g[category="legs"] > g[name="${character.legs}"]`).css('visibility', 'visible');

                            $(`.podiumSvgContainer#${svgElements[index]} svg .skinTone`).css('fill', character.skinTone);
                        });
                    }
                });

                initGlobe({
                    bg: './assets/maps/globe_bg.jpg',
                    diffuse: './assets/maps/worldMap/globe.png',
                    halo: './assets/maps/globe_halo.png',
                });
            }
        });
    }

    takeScreenshot() {
        this.vm.disableScreenshotButton = true;
        ipcRenderer.send('takeScreenshot');
    }

    calculateRankings(winner = undefined) {
        this.players = Array.from(this.gameEngine.players.values());
        const ownership = getCurrentOwnershipStandings(this.gameEngine.map, this.gameEngine.players);

        const playerWhoWon = winner ? winner : this.gameEngine.playerWhoWon;

        this.players.sort((a, b) => {
            if (a.name === playerWhoWon) {
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

module.exports = EndScreenController;