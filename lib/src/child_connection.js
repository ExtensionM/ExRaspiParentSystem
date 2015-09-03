'use strict';

function child_connection(guid,connection){
	var type = "child";
	var value = {
		"id" : guid,
		"status" : connection
	};
	var obj = {
		"type" : type,
		"value" : value
	}
	this.toString = function(){
		return JSON.stringify(obj);
	}
};

module.exports = child_connection;
