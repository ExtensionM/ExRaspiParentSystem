'use strict';

function child_connection(){
	var type = "child";
	this.value = [];
	var obj = {
		"type" : type,
		"value" : this.value
	};

	this.addChildInfo = function(guid,connection){
	    var obj = {"id":guid,"status":connection};
		this.value.push(obj);
	}
	this.toString = function(){
		return JSON.stringify(obj);
	}
};

module.exports = child_connection;
