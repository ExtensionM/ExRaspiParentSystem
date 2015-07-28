'use strict';

function system_command(dest,message){
	var type = "system_command";
    var value = {
		"to" : dest,
		"message" : message
	};
	var obj = {
		"type" : type,
		"value" : value
	};
	this.toString = function(){
		return JSON.stringify(obj);
	}	
};

module.exports = system_command;
