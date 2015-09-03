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
	var receive_command = function(str){
		var obj = JSON.parse(str);
		command.type = obj["type"];
		command.functionName = obj["value"]["functionName"];
		command.id = obj["value"]["id"];
		command.args = JSON.stringify(obj["value"]["args"]);
	};

	var send_command = function(str){
		receive_command(str);
		var obj = {
			"id" : command.id,
			"message" : {
				"type" : command.type,
				"value" : {
					"functionName" : command.functionName,
					"args" : JSON.parse(command.args)
				}
			}
		};
		console.log("receive command to -  id: " + command.id + " ,functionName: " + command.functionName);
		var str = JSON.stringify(obj);
		return str;
	};
	/************************************************************************/
	//子機から送られてきたWebサーバーへの機能の通知
	var functions = {};
	var receive_functions = function(str){
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

	var send_functions = function(str){
		receive_functions(str);
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
	var receive_result = function(str){
		var obj = JSON.parse(str);
		result.name = obj["name"];
		result.id = obj["id"];
		result.dest = obj["dest"];
		result.type = obj["type"];
		result.value = obj["value"];
	};

	var send_result = function(str){
		receive_result(str);
		if(result.value.result == undefined || result.value.result == null){
			result.value.result = {};
		}
		var obj = {
			"type" : "result",
			"value" : {
				"id" : result.id,
				"name" : result.name,
				"functionName" : result.value.functionName,
				"hasError": result.value.hasError,
				"error": result.value.error,
				"result" : result.value.result
			}
		};
		var str = JSON.stringify(obj);
		return str;
	};
	/*******************************************************************************/
	//子機からのメッセージ
	var send_message = function(str){
		receive_result(str); //resultと同じやつで使える
		var obj = {
			"type" : "message",
			"value" : {
				"id" : result.id,
				"name" : result.name,
				"functionName" : result.value.functionName,
				"value" : result.value.value
			}
		};
		var str = JSON.stringify(obj);
		return str;	
	};
	/*******************************************************************************/
	var system_command = function(str){
		obj = JSON.parse(str);
		if(obj.value.to == "childrenclient"){
			children_sender.write(str);
		}else if(obj.value.to == "webclient"){
			webclient_sender.write(str);
		}
	};
	//サーバー&クライアント
	var th = this;
	var message_finish = true;

	var classify_message = function(obj){
		message_finish = true;
		var str = JSON.stringify(obj);
		switch(obj["type"]){
			case 'system_command':
				system_command(str);
				break;
			//子機から機能の通知
			case 'function': 
				var send_json = send_functions(str);
				webclient_sender.write(send_json);
				break;
				//子機からの命令結果
			case 'result':
				var send_json = send_result(str);
				webclient_sender.write(send_json);
				break;	
			case 'message':
				var send_json = send_message(str);
				webclient_sender.write(send_json);
				break;
				//Webサーバーからの命令
			case 'call': 
				var send_json = send_command(str);
				children_sender.write(send_json);
				break;
			case 'child':
				webclient_sender.write(str);
				break;
			default:
				break;
		}	
	};

	var check_message = function(str){
		var string = str.toString();
		if(message_finish){
			try{
				var obj = JSON.parse(string);
				classify_message(obj);
			}catch(ex){
				if(string[0] == "{"){
					join_long_message(string);
				}else{
					console.log("[JSON MESSAGE PARSE ERROR]: " + ex.message);
				}
			}
		}else{
			join_long_message(string);
		}
	};


	var part_of_text = "";
	var join_long_message = function(str){
		var complete_text = "";
		if(message_finish){
			part_of_text = str; 
			message_finish = false;
		}else{
			var complete_text = part_of_text + str;
			part_of_text = complete_text;
			if(complete_text.slice(-1) == "}"){
				message_finish = true;
				try{
					obj = JSON.parse(complete_text);
					classify_message(obj);
				}catch(ex){	
					console.log(ex);
				}
				complete_text = "";
				part_of_text = "";
			}	
		}
	};

	var message_server = new net.Server(function(socket){
		socket.on('data',function(str){
			check_message(str);
		});
	});

	var webclient_server_port = 10000;
	var webclient_sender = new net.Socket();
	webclient_sender.on('error',function(error){});
	webclient_sender.on('close',function(){
		webclient_sender.setTimeout(500,function(){
			webclient_sender.connect(webclient_server_port);
		});
	});

	var children_server_port = 20000;
	var children_sender = new net.Socket();
	children_sender.on('error',function(error){});
	children_sender.on('close',function(error){
		children_sender.setTimeout(500,function(){
			children_sender.connect(children_server_port);
		});
	});

	this.start = function(){
		message_server.listen(12000);
		webclient_sender.connect(webclient_server_port);
		children_sender.connect(children_server_port);
	};
}

module.exports = message_parser;
