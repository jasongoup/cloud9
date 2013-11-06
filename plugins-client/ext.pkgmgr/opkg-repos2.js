/**
 * Created with IntelliJ IDEA.
 * User: jiff
 * Date: 13-7-26
 * Time: 下午4:21
 *
 */

define(function(require, exports, module) {
// basic imports
    var EventEmitter = require("ace/lib/event_emitter").EventEmitter;
    var oop = require("ace/lib/oop");
    var Console = require ("ext/console/console");

// for us to do a require later
    var OpkgEngine2 = module.exports = function () {
        this.connection = undefined;
    };

    oop.inherits (OpkgEngine2, EventEmitter);

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
/*
            var node = apf.n ("<package/>");
            node.attr ("name", "test");
            node.attr ("curver", "alpha");
            node.attr ("ver", "beta");

            this.model.appendXml (node.node (), "/repository");
*/
        };

        /*
         * types:  : result, log
         * actions : build, list, index
         */
        this.onMessage = function (e) {
            var message = e.message;

            if (message.extra !== "opkg") {
                return false;
            }

            var self = this;

            if (message.type === "log") {
                Console.log (message.level + ": " + message.message + "<br>");
            } else if (message.type === "result") {
                // result of index
                if (message.action === "list") {
                    if (message.code === 0)
                        self.setBuilt (message.message);
                }

                self.emit (message.action+"-result", message);

            }
        };

        /* call  opkg-make-index to update Package.gz */
        this.index = function (callback) {
            var request = {
                command : "opkg",
                action  : "index"
            };

            if (callback)
                this.once ("index-result", callback);

            this.ide.send (request);
            this.ide.dispatchEvent("track_action", {type: "opkg"});
        };

        this.build = function (proj,packageArray, callback) {
            var request = {
                command : "opkg",
                action  : "build",
                project : proj,
		packarray:packageArray
            };

            if (callback)
                this.once ("build-result", callback);

            this.ide.send (request);

            this.ide.dispatchEvent("track_action", {type: "opkg"});

        };
		
        this.setBuilt = function (packages) {
            var nodes = this.model.queryNodes ("package");


		//this.model.data.childNodes.length	
		
	    var flag= 0;
	   for(var i=0;i<this.model.data.childNodes.length;i++){
		
		 for (var name in packages){
			flag =0;
			if(this.model.data.childNodes[i].getAttribute("name")==name){
				flag=1;	
				break;
			}
		 }
		if(flag==0){
			this.model.data.childNodes[i].remove();
		}

	   }		
		
	
	    
            nodes.map (function (node) {
               var name = node.getAttribute ("name");
               if (packages[name]) { // package was built
                   node.setAttribute ("ver", packages[name]);
                   delete packages[name];
               } else {
		  // nodes.removeAttribute(node,"name");
                   node.setAttribute ("ver", "");
		  // nodes.remove(node);
		   //node.setAttribute ("name", "");
               }
            });
	   

	     //var tmp_model = this.model.data;
	     //apf.xmldb.cleanXml(tmp_model.xml);


            for (var name in packages) {
                var ver = packages[name];

                var node = apf.n ("<package/>");
                node.attr ("name", name);
		node.attr ("ver", ver);
                node.attr ("curver", "");

                this.model.appendXml (node.node (), "/repository");
            }
        };
	
        this.setInstalled = function (packages) {
            var self = this;

            // query all packages in repository
            var nodes = self.model.queryNodes ("package");
            // set installed package version
            for (var i = 0; i < nodes.length; i++) {
                var name = nodes[i].getAttribute ("name");
                var ver = packages[name] || "";
		
                nodes[i].setAttribute ("ver", ver);

                delete packages[name];
            }

            // packages installed but not in repository
            for (var name in packages) {
                var ver = packages[name];

                var node = apf.n ("<package/>");
                node.attr ("name", name);
                node.attr ("ver", ver);
                node.attr ("curver", "");

                self.model.appendXml (node.node (), "/repository");
            }
        };
        
        /*
         * send request to list packages in repository,
         * return all packages if 'packages' argument is null
         *
         */
        this.list = function (callback) {
            var request = {
                command : "opkg",
                action  : "list"
            };

            // FIXME: callback on list result

            if (callback) {
                this.once ("list-result", callback);
            }
            this.ide.send (request);

//            ???:
            this.ide.dispatchEvent("track_action", {type: "opkg"});
        };
    }).call (OpkgEngine2.prototype);
});
