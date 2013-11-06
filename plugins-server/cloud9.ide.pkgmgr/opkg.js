/**
 * Created with IntelliJ IDEA.
 * User: jiff
 * Date: 13-7-3
 * Time: 下午3:30
 * To change this template use File | Settings | File Templates.
 */
// basic imports
var events = require('events');
var fs = require ('fs.extra');
var util = require("util");
var child = require ('child_process');
var S = require ('string');

// for us to do a require later
module.exports = Opkg;

function Opkg(project, reposPath) {
    events.EventEmitter.call(this);
    this.proj = project;
    this.destdir = project.getAttribute ("destdir");
    this.reposPath = reposPath;
    this.packages = project.getElementsByTagName ("package");
}


// inherit events.EventEmitter
util.inherits (Opkg, events.EventEmitter);
Opkg.prototype.init = function () {
    if (typeof String.prototype.startsWith != 'function') {
        // see below for better implementation!
        String.prototype.startsWith = function (str){
            return this.indexOf(str) == 0;
        };
    }
};

Opkg.prototype.cleanup = function (index, err) {
    fs.remove (this.cachedir);
};

Opkg.prototype.pkgCount = function () {
    return this.packages.length;
};

Opkg.prototype.make = function(index) {
    var self = this;

    if ((typeof index === 'undefined') && (self.packages.length > 0)) {
        index = 0;
    }

    if (index >= 0) {

        // emit package at index is finished, with error err (null if success)
        this.makePkg (index);

        return;
    } else {
        // TODO:
        // no package defined
    }
};



/* install all files in fileList, index is current file, call cb on end or error
 * srcdir - all files in list start with srcdir
 * destdir - all files will be installed under destdir and subdir
 */

Opkg.prototype.installFile = function (fileList, index, srcdir, destdir, cb) {
    var self = this;

    if (index >= fileList.length) {
        cb ();
        return;
    }

    var f = fileList [index];
    var params = {};

    var attr = f.getAttribute ("src");

    attr = S (attr).chompLeft (srcdir).chompLeft("/").s;

    params.name = attr;

    attr = f.getAttribute ("dest");
    if (attr) {
        // TODO: check if dest endwith '/' or is directory
        params.dest = S(attr).chompLeft(destdir).chompLeft("/").s;
    } else {
        params.dest = params.name;
    }

    params.mode = f.getAttribute ("mode");
    params.owner = f.getAttribute ("owner");
    params.group = f.getAttribute ("group");

    var src = srcdir + params.name;
    var dest = destdir + params.dest;
/*
    var d = dest.slice (0, dest.lastIndexOf ('/'));
    if (!fs.exists (d)) {
        fs.mkdirpSync (d);
    }*/

    var pos = dest.lastIndexOf("/");
    if (pos >= 0) {
        var d = dest.slice (0, pos);
        if (!fs.existsSync (d)) {
            fs.mkdirRecursiveSync (d, mode=0755);
        }
    }

    fs.lstat (src, function (err, stats) {
        if (err) {
            self.emit ("error", err);
            return;
        }

        if (stats.isFile ()) {
            try {
                fs.copy (src, dest, function (err) {
                    if (err) {
                        self.emit ("error", err);
                        return;
                    }

                    if (typeof params.mode === 'undefined') {
                        var st = fs.statSync (dest);
                        params.mode = st.mode;
                    }
					
					params.mode = 0755;

                    fs.chmod (dest, params.mode, function (err) {
                        if (err) {
                            self.emit ("error", err);
                        } else {
                            self.installFile (fileList, index + 1, srcdir, destdir, cb);
                        }
                    });
                });
            } catch (e) {
                self.emit ("error", e);
            }
        } else if (stats.isDirectory ()) {
            // TODO: copy directory recursively
            self.emit ("error", "Install directory is not supported yet");
        }
    });
};

Opkg.prototype.tgz = function (pathname, cwd, files, callback) {
    var self = this;
    var args = ["-zc", "-f", pathname];

    var proc = child.spawn ("tar",  args.concat(files),
        {stdio: ['ignore', 'pipe', 'pipe'], cwd: cwd, env: process.env} );

    proc.on('exit', function (code, signal) {
        callback (code);
    });

    proc.stdout.on('data', function (data) {
        self.emit ("log", data);
    });

    proc.stderr.on('data', function (data) {
        console.log ("tar:" + data);
    });
};

Opkg.prototype.makeControlTgz = function (index, dir, callback) {
    /*
     control
     Package: opkg-hello
     Version: 0.0.1
     Description: Sample OPKG package
     Section: cyanogenmod/applications
     Priority: optional
     Maintainer: Jiang Yio
     Architecture: all
     Homepage: http://inportb.com/
     Source:
     Depends:
     */
    this.emit ("log", "info", "create " + dir + "/CONTROL/control");

    var self = this;
    var pkg = this.packages[index];

    var content = "";
    content += "Package: " + pkg.getAttribute("name")+"\n";
    content += "Version: " + self.proj.getAttribute ("ver")+"\n";
    content += "Description: " + pkg.getAttribute ("desc") + "\n";
    content += "Section: " + pkg.getAttribute ("section") + "\n";
    content += "Priority: " + pkg.getAttribute ("prio") + "\n";
    content += "Maintainer: " + self.proj.getAttribute ("maintainer") + "\n";
    content += "Architecture: " + pkg.getAttribute ("arch") + "\n";
    content += "Homepage: " + self.proj.getAttribute ("homepage") + "\n";
    content += "Depends: " + pkg.getAttribute ("depends") + "\n";
    fs.outputFileSync (dir+"/CONTROL/control", content);

    var scripts = ["preinst", "postinst", "prerm", "postrm"];
    for (var i in scripts) {
        var script = scripts[i];
        content = pkg.getAttribute (script);

        self.emit ("log", "info", "create " + script);
        /* TODO: Android service register */
        var pathname = dir + "/CONTROL/" + script;
        fs.outputFileSync (pathname, content ? content : "#!/system/bin/sh\n");
        fs.chmodSync (pathname, 0755);
    }

    self.emit ("log", "debug", "begin create control.tar.gz");
    self.tgz (dir + "/control.tar.gz", dir+"/CONTROL", scripts.concat (['control']),function (code) {
        if (code !== 0) {
            self.emit ("error", -1, 'create control.tar.gz exited:' + code);
            return;
        } else {
            self.emit ("log", "info", "create control.tar.gz successful")
        }

        fs.remove (dir+"/CONTROL", callback)
    });
};

Opkg.prototype.makeDataTgz = function (pkg, src, dest, callback) {
    var self = this;
    try {
        src = fs.realpathSync (src);
        if (!S(src).endsWith ("/")) {
            src += "/";
        }
        dest = fs.realpathSync (dest) + "/";
    } catch (e) {
        self.emit ("error",-1, e);
        return;
    }

    var files = pkg.getElementsByTagName ("file");
    this.installFile (files, 0, src, dest + "data/", function (err) {
       if (!err) {
        self.tgz (dest + "data.tar.gz", dest+"data/", ["."], callback);
       } else
        callback (err);
    });
};

Opkg.prototype.makeOpk = function (pathname, dir, callback) {
    var self = this;
    var args = ["-crf"];

    args.push(pathname);
    args.push ("./debian-binary");
    args.push ("./data.tar.gz");

    args.push ("./control.tar.gz");

    child.execFile('ar', args, {cwd:dir}, function(err, stdout, stderr) {
        callback.apply (self, [err, stderr]);
    });
};


Opkg.prototype.rmFile = function(filename,callback) {

    var self = this;
    
    var cmd = "rm -rf  " + self.reposPath + "/"+ filename +"*.opk";
    console.log("cmd=" +cmd+"\n");
    
    //fs.remove(pathfile);
    	
    child.exec(cmd,  function(err, stdout, stderr) {

	//	console.log("0000000000000000000000000000000000\n");
        //	callback.apply (this, err, stderr);

		 if (err !== null) {
     			 console.log('exec error: ' + error);
   		 }
    	});
  	


}

Opkg.prototype.makePkg = function (index) {
    var self = this;
    var pkg = self.packages[index];

    var name = pkg.getAttribute("name");

    this.emit ("pkg-start", index, name);

    var ver = self.proj.getAttribute ("ver");
    var dir = "/tmp/c9.opk." + name;
    self.cachedir = dir;

    if (fs.existsSync(dir)) {
        try {
            // exception caught new file is adding to directory while deleting
            fs.removeSync (dir);
        } catch (e) {
            // FIXME: report error
        }
    }

    self.once ("error", self.cleanup);

    fs.outputFile(dir + "/" + "debian-binary", '2.0', function (err) {
        if (err) {
            self.emit ("error", -1, err);
            return;
        }
    });

    self.makeControlTgz ( index, dir, function (err) {
        if (err) {
            // TODO: error report
            self.emit ("error", -1, err);
            return;
        }

        try {
            if (!fs.existsSync (dir + "/data"))
                fs.mkdirSync (dir + "/data");
        } catch (e) {
            self.emit ("error", -1, e);
        }

        self.makeDataTgz (pkg, self.destdir, dir, function (err) {
            if (err) {
                // TODO: error report
                self.emit ("error", -1,  err);
                return;
            }

            self.makeOpk (self.reposPath + "/" + name + "_" + ver + ".opk", dir, function (err) {
                if (err) {
                    self.emit ("error", -1, err);
                    return;
                }

                self.emit ("pkg-end", index, "package success");
                self.removeListener ("error", self.cleanup);
            });
        });

    });
};
