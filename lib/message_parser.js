var fs = require('fs');
var ursa = require('ursa');
var dgram = require('dgram');
var tls = require('tls');
var net = require('net');
var mongoose = require('mongoose');
/**
 * インスタンスを初期化します。
 * @constructor
 * @classdec メッセージを整えるためのクラス
 */
var message_parser = function(){

	/************************************************************************/
	//Webサーバーから送られてきた子機への命令
	var command = {};
	/**
	 * commandに子機への命令を保存する
	 * @param  {String} str - Webサーバーから送られてきた子機への命令のJson文字列
	 */
	var receive_command = function(str){
		var obj = JSON.parse(str);
		command.type = obj["type"];
		command.functionName = obj["value"]["functionName"];
		command.id = obj["value"]["id"];
		command.args = JSON.stringify(obj["value"]["args"]);
		command.client = obj["value"]["client"];
	};

	/**
	 * Webサーバーからの命令を親機へ送信します。
	 * @param  {String} str - Webサーバーから送られてきた子機への命令のJson文字列
	 * @return {String} str - 子機に送信する命令Jsonの文字列
	 */
	var send_command = function(str){
		receive_command(str);
		var obj = {
			"id" : command.id,
			"message" : {
				"type" : command.type,
				"value" : {
					"functionName" : command.functionName,
					"args" : JSON.parse(command.args),
					"client" : command.client
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

	/**
	 * 子機から送らてきた通知文字列Jsonをfunctionsに保存する
	 * @param  {String} str - 子機から送られてきたWebサーバーへの機能通知Json文字列
	 */
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

	/**
	 * Webサーバーに送信するための子機機能通知Jsonを作成する。
	 * @param  {String} str - 子機から送られてきたWebサーバーへの機能通知Json文字列
	 * @return {String} str - Webサーバーに送信する子機からの機能通知Json文字列
	 */
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

	/**
	 * 子機から送られてきた命令結果Jsonを一時保存する
	 * @param  {String} str - 子機から送られてきた命令結果Json文字列
	 */
	var receive_result = function(str){
		var obj = JSON.parse(str);
		result.name = obj["name"];
		result.id = obj["id"];
		result.dest = obj["dest"];
		result.type = obj["type"];
		result.value = obj["value"];
	};

	/**
	 * Webサーバーに送る子機からの命令結果Jsonを作成します。
	 * @param  {String} str - 子機から送られてきた命令結果Json文字列
	 * @return {String} str - Webサーバーに送る命令結果Json文字列
	 */
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
				"result" : result.value.result,
				"client" : result.value.client
			}
		};
		var str = JSON.stringify(obj);
		return str;
	};


	/*******************************************************************************/
	//子機からのメッセージ
	/**
	 * 子機から送られてきたtype:messageのJson文字列をWebサーバーへ送信する用に変換する
	 * @param  {String} str - 子機から送られてきたmessageJson文字列
	 * @return {String} str - Webサーバーに送るmessageJsom文字列
	 */
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
	
	/**
	 * システムコマンドを送信します。
	 * @param  {String} str - システムコマンド文字列
	 */
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

	/**
	 * 送られてきたJsonオブジェクトを分類して処理します。
	 * @param  {Object} Webサーバークライアントまたは子機クライアントから送られてきたJsonオブジェクト
	 */
	var classify_message = function(obj){
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

	/**
	 * 送られきた文字列を適切なJsonの形に変換します
	 * @param  {Object} str - 送られてきたメッセージ
	 */
	var check_message = function(str){
		var string = str.toString();
		try{
			var obj = JSON.parse(string);
			classify_message(obj);
		}catch(ex){
			join_long_message(string);
		}
	};


	var part_of_text = "";
	/**
	 * 文字列を適正なjsonの形にします。
	 * @param  {String} str - 繋げたい文字列
	 */
	var join_long_message = function(str){
		if(message_finish){
			part_of_text = str; 
			message_finish = false;
		} else {
			complete_text = part_of_text + str;
			part_of_text = complete_text;
			if(complete_text.slice(-1) == "}"){
				message_finish = true;
				try{
					obj = JSON.parse(complete_text);
					classify_message(obj);
				}catch(ex){	
					if(str.indexOf("{") != -1 && str[str.indexOf("{") - 1] == "}"){
						complete_text = complete_text.split(str.substr(str.indexOf("{"),str.length)).join("");
						try{
							obj = JSON.parse(complete_text);
							classify_message(obj);
							complete_text = part_of_text.split(complete_text).join("");
							obj2 = JSON.parse(complete_text);
							classify_message(obj2);
						} catch (ex) {
							check_miss_message(complete_text);
						}
					} else {
						console.log(ex);
						console.log(complete_text);
					}
				}
				complete_text = "";
				part_of_text = "";
			}	
		}
	};

	var count_curly = function(str){
		left_curly_count = 0;
		right_curly_count = 0;
		start_json = -1;
		for(var i = 0, s = str, c = 0; i < s.length; i++) {
			if(s[i] === "{"){
				right_curly_count++;
				if(start_json == -1) start_json = i;
			}
			if(s[i] === "}") left_curly_count++;
			if(right_curly_count === left_curly_count && right_curly_count != 0){
				return str.substr(start_json,i + 1);
			}
		}
		return null;
	}

	var check_miss_message = function(str){
		source_text = str;
		json_text = count_curly(source_text);
		try {
			while(json_text != null){
				classify_message(JSON.parse(json_text));
				source_text = source_text.split(json_text).join("");
				json_text = count_curly(source_text);
			}	
		} catch(ex) {
			console.log(ex);
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

	/**
	 * システムをスタートさせます。
	 */
	this.start = function(){
		message_server.listen(12000);
		webclient_sender.connect(webclient_server_port);
		children_sender.connect(children_server_port);
	};
}

module.exports = message_parser;
