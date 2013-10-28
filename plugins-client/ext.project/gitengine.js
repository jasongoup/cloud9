


define(function(require, exports, module) {
// basic imports
    var EventEmitter = require("ace/lib/event_emitter").EventEmitter;
    var oop = require("ace/lib/oop");
    var settings = require("core/settings");
  //  var Console = require ("ext/console/console");

// for us to do a require later
    var GitEngine = module.exports = function () {
        this.connection = undefined;
    };

    oop.inherits (GitEngine, EventEmitter);

    (function () {
        oop.implement(this, EventEmitter);

        this.model = new apf.model ().load ("<gitcommit/>");

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

            if (message.extra !== "project") {
                return false;
            }

            var self = this;

            if (message.type === "log") {
                Console.log (message.level + ": " + message.message + "<br>");
            } else if (message.type === "result") {
                // result of index
                if (message.action === "gitlist") {
                    if (message.code === 0)
		    {
                        self.showList(message.message);
		    }
                }

                self.emit (message.action+"-result", message);

            }
        };
	
	    this.showList = function (files) {
            var self = this;

	    var flag= 0;
           for(var i=0;i<this.model.data.childNodes.length;i++){

                 for (var name in files){
                        flag =0;
                        if(this.model.data.childNodes[i].getAttribute("name")==name){
                                flag=1;
                                break;
                        }
                 }	

                if(flag==0){
                        this.model.data.childNodes[i].attributes.name.value = "";
                }

           }
	   
	   for(var i=0;i<this.model.data.childNodes.length;i++){
			
			var name = this.model.data.childNodes[i].getAttribute("name");
			if(name==null||name==""){

				this.model.data.childNodes[i].remove();
			}
	
	   }
			   

            // query all files in gitcommit
            var nodes = self.model.queryNodes ("files");
            // set installed files status
            for (var i = 0; i < nodes.length; i++) {
                var name = nodes[i].getAttribute ("name");
                var filestatus = files[name] || "";

                nodes[i].setAttribute ("status", filestatus);

                delete files[name];
            }

            // files installed but not in gitcommit
            for (var name in files) {
                var filestatus = files[name];

                var node = apf.n ("<files/>");
                node.attr ("name", name);
                node.attr ("status", filestatus);
		node.attr ("select","");

                self.model.appendXml (node.node (), "/gitcommit");
            }	

	     settings.save(true);

        };



        this.gitclone = function (proj,type,callback) {

            var request = {
                command : "project",
                action  : "gitclone",
				project : proj,
				type:type
            };

            // FIXME: callback on list result

            if (callback) {
                this.once ("gitclone-result", callback);
            }
            this.ide.send (request);

//            ???:
            this.ide.dispatchEvent("track_action", {type: "project"});
        };
	
	this.gitList = function (proj,callback) {

            var request = {
                command : "project",
                action  : "gitlist",
                                project : proj
            };

            // FIXME: callback on list result

            if (callback) {
                this.once ("gitlist-result", callback);
            }
            this.ide.send (request);

            this.ide.dispatchEvent("track_action", {type: "project"});
        };

	this.gitCommit = function(proj,note,fileshash,callback) {
		
	    
            var request = {
                command : "project",
                action  : "gitcommit",
                project :  proj,
		fileshash: fileshash,
		note	:  note
            };

            // FIXME: callback on list result

            if (callback) {
                this.once ("gitcommit-result", callback);
            }
            this.ide.send (request);

            this.ide.dispatchEvent("track_action", {type: "project"});



	}

	this.gitRemoteCommit = function(proj,url,callback) {


            var request = {
                command : "project",
                action  : "gitremotecommit",
                project :  proj,
		url	:  url
            };

            // FIXME: callback on list result

            if (callback) {
                this.once ("gitremotecommit-result", callback);
            }
            this.ide.send (request);

            this.ide.dispatchEvent("track_action", {type: "project"});



        }
		
	
    	this.gitInit = function (proj,callback) {

            var request = {
                command : "project",
                action  : "gitinit",
				project : proj
            };

            // FIXME: callback on list result

            if (callback) {
                this.once ("gitinit-result", callback);
            }
            this.ide.send (request);

            this.ide.dispatchEvent("track_action", {type: "project"});
        };
    }).call (GitEngine.prototype);	
});
