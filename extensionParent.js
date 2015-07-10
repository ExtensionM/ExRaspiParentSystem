var mparser = require("./lib/message_parser.js");
var webclient = require("./lib/webserver_client.js");
var chclient = require("./lib/children_client.js");

var RaspiParentSystem = function(public_key_path,private_key_path,crt_file_path){
	var cclient = new chclient(public_key_path,private_key_path,crt_file_path);
	var wclient = new webclient();
	var mpserver = new mparser();
	this.start = function(){
		cclient.start();
		wclient.start();
		mpserver.start();
	}
};
module.exports = RaspiParentSystem;
