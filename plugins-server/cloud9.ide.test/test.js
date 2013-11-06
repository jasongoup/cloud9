/**
 * State Module for the Cloud9 IDE
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
"use strict";

var Plugin = require("../cloud9.core/plugin");
var util = require("util");

var name = "test";

module.exports = function setup(options, imports, register) {
    imports.ide.register(name, TestPlugin, register);
};

var TestPlugin = function(ide, workspace) {
    Plugin.call(this, ide, workspace);
    this.hooks = ["command"];
    this.name = name;
};

util.inherits(TestPlugin, Plugin);

(function() {

    this.command = function(user, message, client) {
console.log('dddddccccxxxxxxx');
       if (message.command != "opkg1")
            return false;

        var self = this;

        switch (message.action) {
            case "testThis":
                self.test ();
                break;
		}
        return true;
    };
	
	this.test = function(){
		console.log('dddddddddddddddd');
		return;
	};

}).call(TestPlugin.prototype);