/**
 * Created with IntelliJ IDEA.
 *
 */

define(function(require, exports, module) {
// basic imports
    var EventEmitter = require("ace/lib/event_emitter").EventEmitter;
    var oop = require("ace/lib/oop");
    var Console = require ("ext/console/console");


    var PjbuildEngine = module.exports = function () {
        this.connection = undefined;
    };

    oop.inherits (PjbuildEngine, EventEmitter);

    (function () {
        oop.implement(this, EventEmitter);

        this.model = new apf.model ().load ("<repository/>");

        this.once = function(event, fun) {
            var _self = this;
            var newCallback = function() {
                fun && fun.apply(_self, arguments);
                _self.removeEventListener(event, newCallback);
            };

            this.addEventListener(event, newCallback);
        };

        this.emit = this._dispatchEvent;

        this.init = function (ide) {

			this.$onMessage = this.onMessage.bind(this);

            ide.addEventListener("socketMessage", this.$onMessage);
            this.ide = ide;

        };

        /*
         * types:  : result, log
         * actions : build, list, index
         */
        this.onMessage = function (e) {
            var message = e.message;

            if (message.extra !== "pjbuild") {
                return false;
            }

            var self = this;

            if (message.type === "log") {
                if(message.level == -1){
					Console.log("<div ><font color='#FF0000'>The operation has some error:</font> </div>");					
				}else{
					Console.log("<div ><font color='#33cc00'>make building: </div>");	
				}
				Console.log("<div style='margin-left:10px'>" + message.message + "</div>");
            }
        };

       this.build = function(key_var){
		    var request = {
					command : "pjbuild",
					 action : "onBuild",
					  shell : txtBuildShell.value,
					   argv : txtBuildArg.value,
					key_var : key_var
			   };
			   
			if(key_var == "" || key_var == null){
				Console.log("Please select a right build file!");
				return;
			}
			
			this.ide.send (request);
			this.ide.dispatchEvent("track_action", {type: "pjbuild"});
	  };
		
    }).call (PjbuildEngine.prototype);
});
