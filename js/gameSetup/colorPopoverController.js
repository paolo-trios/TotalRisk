import {PLAYER_COLORS} from './../player/playerConstants';

export default class ColorPopoverController {
    constructor($scope) {
        this.vm = this;
        this.vm.init = this.init;
    }

    init(player) {
        this.vm.colors = Array.from(Object.keys(PLAYER_COLORS).map((key, index) => PLAYER_COLORS[key]));
        this.vm.player = player;
    }
}