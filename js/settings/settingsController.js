const {runningElectron} = require('./../helpers');

class SettingsController {

    constructor($scope, $timeout, settings, aiHandler, soundService, gameEngine) {
        this.vm = this;
        this.vm.settings = settings;
        this.aiHandler = aiHandler;
        this.soundService = soundService;
        this.gameEngine = gameEngine;

        this.vm.runningElectron = runningElectron();

        this.vm.proxySettings = {
            username: this.vm.settings.proxySettings && this.vm.settings.proxySettings.username ? this.vm.settings.proxySettings.username : '',
            password: this.vm.settings.proxySettings && this.vm.settings.proxySettings.password ? this.vm.settings.proxySettings.password : '',
            host: this.vm.settings.proxySettings && this.vm.settings.proxySettings.host ? this.vm.settings.proxySettings.host : ''
        };

        // PUBLIC FIELDS
        this.vm.movementSliderOptions = {
            showTicks: true,
            stepsArray: Object.keys(this.vm.settings.aiSpeedValues),
            onChange: () => {
                this.vm.settings.aiSpeed = this.vm.aiSpeed;
                this.aiHandler.update();
                this.soundService.changeColor.play();

                this.vm.settings.saveSettings();
            }
        };
        this.vm.musicVolumeSliderOptions = {
            showTicks: false,
            stepsArray: Array.from(new Array(101), (x, i) => i),
            onChange: () => {
                this.vm.settings.musicVolume = this.vm.musicVolume;
                this.gameEngine.setMusicVolume(this.vm.settings.musicVolume);
                this.vm.settings.saveSettings();
            }
        };
        this.vm.sfxVolumeSliderOptions = {
            showTicks: false,
            stepsArray: Array.from(new Array(101), (x, i) => i),
            onChange: () => {
                this.vm.settings.sfxVolume = this.vm.sfxVolume;
                this.vm.settings.saveSettings();
            }
        };
        this.vm.aiSpeed = this.vm.settings.aiSpeed;
        this.vm.musicVolume = this.vm.settings.musicVolume;
        this.vm.sfxVolume = this.vm.settings.sfxVolume;

        // PUBLIC FUNCTIONS
        this.vm.toggleSound = this.toggleSound;
        this.vm.toggleAnnouncer = this.toggleAnnouncer;
        this.vm.toggleFullScreen = this.toggleFullScreen;
        this.vm.updateProxySettings = this.updateProxySettings;
    }

    updateProxySettings() {
        this.vm.settings.proxySettings = this.vm.proxySettings;
        this.vm.settings.saveSettings();
    }

    toggleSound() {
        if (this.vm.settings.playSound) {
            this.soundService.changeColor.play();
            this.vm.settings.toggleSound();
            this.gameEngine.toggleSound();
        } else {
            this.vm.settings.toggleSound();
            this.gameEngine.toggleSound();
            this.soundService.changeColor.play();
        }
    }

    toggleFullScreen() {
        this.vm.settings.fullScreen = !this.vm.settings.fullScreen;

        const window = electron.remote.getCurrentWindow();
        window.setFullScreen(this.vm.settings.fullScreen);

        this.vm.settings.saveSettings();
    }

    toggleAnnouncer() {
        this.vm.settings.showAnnouncer = !this.vm.settings.showAnnouncer;
        this.soundService.changeColor.play();

        this.vm.settings.saveSettings();
    }

}

module.exports = SettingsController;