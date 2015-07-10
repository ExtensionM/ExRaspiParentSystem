var fs = require('fs');
var ursa = require('ursa');
var dgram = require('dgram');
var tls = require('tls');
var net = require('net');
var mongoose = require('mongoose');

var message_parser = function(){

	/************************************************************************/
	//Webサーバーから送られてきた子機への命令
	var command = {};
	this.receive_command = function(str){
		var obj = JSON.parse(str);
		command.type = obj["type"];
		command.function = obj["value"]["function"];
		command.id = obj["value"]["id"];
		command.args = JSON.stringify(obj["value"]["args"]);
	};

	this.send_command = function(str){
		this.receive_command(str);
		var obj = {
			"id" : command.id,
			"message" : {
				"type" : command.type,
				"value" : {
					"function" : command.function,
					"args" : JSON.parse(command.args)
				}
			}
		};
		var str = JSON.stringify(obj);
		return str;
	};
	/************************************************************************/
	//子機から送られてきたWebサーバーへの機能の通知
	var functions = {};
	this.receive_functions = function(str){
		var obj = JSON.parse(str);
		functions.name = obj["name"];
		functions.id = obj["id"];
		functions.dest = obj["dest"];
		functions.type = obj["type"];
		functions.value = [];
		for(var i=0;i<obj["value"].length;i++){
			functions.value[i] = JSON.stringify(obj["value"][i]);
		}
	};

	this.send_functions = function(str){
		this.receive_functions(str);
		var obj = {
			"type" : "notice",
			"value" : {
				"id" : functions.id,
				"name" : functions.name,
				"functions" : []
			}
		};
		for(var i=0;i<functions.value.length;i++){
			obj["value"]["functions"][i] = JSON.parse(functions.value[i]);
		}
		var str = JSON.stringify(obj);
		return str;
	};
	/************************************************************************/
	//子機から命令の結果
	var result = {};
	this.receive_result = function(str){
		var obj = JSON.parse(str);
		result.name = obj["name"];
		result.id = obj["id"];
		result.dest = obj["dest"];
		result.type = obj["type"];
		result.value = JSON.stringify(obj["value"]);
		
	};

	this.send_result = function(str){
		this.receive_result(str);
		var obj = {
			"type" : "result",
			"value" : {
				"id" : result.id,
				"name" : result.name,
				"value" : JSON.parse(result.value)
			}
		};
		var str = JSON.stringify(obj);
		return str;
	};
	/*******************************************************************************/
	//サーバー&クライアント
	var th = this;

	this.check_message = function(str){
		var obj = JSON.parse(str);
		switch(obj["type"]){
			//子機から機能の通知
			case 'function': 
				var send_json = this.send_functions(str);
				this.webclient_sender.write(send_json);
				break;
			//子機からの命令結果
			case 'result':
				var send_json = this.send_result(str);
				this.webclient_sender.write(send_json);
			    break;	
			//Webサーバーからの命令
			case 'command': 
				var send_json = this.send_command(str);
				this.children_sender.write(send_json);
				break;
		}
	};

	this.message_server = new net.Server(function(socket){
		socket.on('data',function(str){
			console.log("DATA RECIVED");
			th.check_message(str);
		});
	});

	this.webclient_server_port = 10000;
	this.webclient_sender = new net.Socket();
	this.webclient_sender.on('error',function(error){
		th.webclient_sender.connect({port:th.webclient_server_port});
	});
	
	this.children_server_port = 20000;
	this.children_sender = new net.Socket();
	this.children_sender.on('error',function(error){
		th.children_sender.connect({port:th.children_server_port});
	});

	this.start = function(){
		this.message_server.listen(12000);
		this.webclient_sender.connect(this.webclient_server_port);
		this.children_sender.connect(this.children_server_port,function(){
			console.log("CONNECT TO CHILDREN SERVER");
		});
	};
}

var c = new message_parser();
c.start();
module.export = message_parser;
