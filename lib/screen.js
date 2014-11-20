// websocekt.
var ws;
// const
const STORAGE_KEY = "storage_key";
const USER_SEQUENCE_KEY = "header_key";
const HEADER_KEY_PREFIX = "header_key_";
const DELETE_KEY = "delete_key";
const CURRENT_DISPLAY_KEY = "current_display_key";

// when application loaded. this method callesd. (get the menu)
$(document).ready(function() {
	if (window.localStorage) {
		// if logged in.
		if (window.localStorage.getItem(STORAGE_KEY)) {
			var user = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
			createLogoutForm(user["user_id"]);
			login();
			$("#create_question_button").show();
		// if not logged in.
		} else {
			createLoginForm();
			$("#create_question_button").hide();
		}
	}
	getHeaders();
});

// create question.
function createQuestion() {
	var user = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
	var param = {
		text : $('#input_header').val(),
		user_sequence : user ? user["user_sequence"] : null,
	};
	postData('/create/header', JSON.stringify(param), createHeader, "application/json");
}

// create inserted menu
function createHeader(val) {
	$('#input_header').val("");
	$("#nav_list").append("<li id='menu_" + val["header_key"] + "'>"
		+ "<a href='#' onclick='onClickLink(this)'>"
		+ htmlEscape(val["text"])
		+ "</a><span style='display:none;'>"
		+ val["header_key"]
		+ "</span>"
		+ "</a><span style='display:none;'>"
		+ val["user_sequence"]
		+ "</span>"
		+ "</li>");
	if (window.localStorage.getItem(STORAGE_KEY)) {
		if ($("#user_questions").children().length == 1) {
			$("#user_questions").empty();
			$("#user_questions").append("<h5>投稿した質問</h5>");
		}
		$("#user_questions").append("<div id='user_question_" + val["header_key"] + "'>"
			+ "<span style='cursor : pointer;' onclick='deleteQuestion(this)'>&times&nbsp&nbsp</span>"
			+ "<span style='display:none;'>"
			+ val["header_key"]
			+ "</span>"
			+ val["text"]
			+ "</div>");
	}
}

// get menu.
function getHeaders() {
	getData('/select/header', null, createHeaders);
}

// create menu form.
function createHeaders(val) {
	$('#input_header').val("");
	$("#nav_list").empty();
	for (var i = 0; i < val.length; i++) $("#nav_list").append("<li id='menu_" + val[i]["header_key"] + "'>"
		+ "<a href='#' onclick='onClickLink(this)'>"
		+ htmlEscape(val[i]["text"])
		+ "</a><span style='display:none;'>"
		+ val[i]["header_key"]
		+ "</span>"
		+ "</a><span style='display:none;'>"
		+ val[i]["user_sequence"]
		+ "</span>"
		+ "</li>");
		
	ws = new WebSocket("ws://tsubakiyaserver.atnifty.com");
	//ws = new WebSocket("ws://192.168.11.4:8880");
	ws.onmessage = function (e) {
		var result = JSON.parse(e.data);
		createContents(result);
	};
	ws.onclose = function (e) {
		console.log('切断', e.code + ' - ' + e.type);
	};
}

// click menu link.
function onClickLink(val) {
	window.localStorage.setItem(USER_SEQUENCE_KEY, $(val).next().next().html());
	window.localStorage.setItem(CURRENT_DISPLAY_KEY, $(val).next().html());
	ws.send(createWsPostData($(val).next().html(), "contents"));
}

// create answer form to the questions.
function createContents(contents) {
	var user = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
	$("#contents_area").hide();
	$("#contents_area").empty();
	// if not error message.
	if (!contents[0]["message"]) {
		if (getTotalCount(contents) > 0) {
			$("#contents_area").append("<div id='graph' class='hero-unit'><div>");
			createChart(createChartData(contents));
		} else {
			$("#contents_area").append("<div id='graph' class='hero-unit'>まだ投票がされていません<div>");
		}
		if (user && (user["user_sequence"] == window.localStorage.getItem(USER_SEQUENCE_KEY))) {
			$("#contents_area").append(getCreateManagerForm(contents));
		}
		$("#contents_area").append(getCreateContentsForm(contents));
		var counter = 0;
		var contentId = 0;
		// create tiles.
		for (var i = 0; i < contents.length; i++) {
			// column 1
			if (counter == 0) {
				$("#contents_area").append("<div id='content_" + contentId + "' class='row-fluid'></div>");
				$("#content_" + contentId).append(createVoteForm(contents[i]));
				counter++;
			// column 3
			} else if (counter == 2) {
				$("#content_" + contentId).append(createVoteForm(contents[i]));
				counter = 0;
				// increment row count
				contentId++;
			// column 2
			} else {
				$("#content_" + contentId).append(createVoteForm(contents[i]));
				counter++;
			}
		}
		$("#contents_area").fadeIn();
	// if error message exist.
	} else {
		$("#contents_area").append("<div id='graph' class='hero-unit'>まだ回答がされていません<div>");
		if (user && user["user_sequence"] == window.localStorage.getItem(USER_SEQUENCE_KEY)) {
			$("#contents_area").append(getCreateManagerForm(contents));
		}
		$("#contents_area").append(getCreateContentsForm(contents));
		$("#contents_area").fadeIn();
	}
}

// create chart.
function createChartData(val) {
	var data = [];
	var total = getTotalCount(val);
	for (var i = 0; i < val.length; i++) {
		var count = Math.floor(val[i]["count"] / total * 100);
		data.push([val[i]["text"], count]);
	}
	return data;
}

// create vote forms. (to the answers)
function createVoteForm(val) {
	return "<div class='span4'>"
		+ "<h4>" + htmlEscape(val["text"]) + " : " + (val["count"]) + "票" + "</h4>"
		+ "<input type='button' class='btn btn-primary' onclick='onClickContents(this)' value='投票する'>"
		+ "<div id='hidden_contents_key' style='display:none;'>" + val["contents_key"] + "</div></input>"
		+ "</div>";
}

// manupilation total caount.
function getTotalCount(val) {
	var total = 0;
	for (var i = 0; i < val.length; i++) {
		total += val[i]["count"];
	}
	return total;
}

// create answer forms for Manager (to the questions)
function getCreateManagerForm(val) {
	return "<div class='input'>"
		+ "<textarea class='xxlarge' id='input_contents' rows='3'></textarea>"
		+ "<button type='submit' class='btn' onclick='createAnswerForManager(this)'>質問を作成する</button>"
		+ "<div id='hidden_header_key_manager' style='display:none;'>" + val[0]["header_key"] + "</div>"
		+ "</div>";
}

// create answer forms (to the questions)
function getCreateContentsForm(val) {
	return "<div class='input'>"
		+ "<textarea class='xxlarge' id='input_contents' rows='3'></textarea>"
		+ "<button type='submit' class='btn' onclick='createAnswer(this)'>質問に答える</button>"
		+ "<div id='hidden_header_key' style='display:none;'>" + val[0]["header_key"] + "</div>"
		+ "</div>";
}

// vote to answers.
function onClickContents(val) {
	if (window.localStorage) {
		if (window.localStorage.getItem(HEADER_KEY_PREFIX + $('#hidden_header_key').html())) {
			$("#modal").modal();
		} else {
			window.localStorage.setItem(HEADER_KEY_PREFIX + $('#hidden_header_key').html(), 
				$('#hidden_header_key').html());
			var reqParam = { header_key : $('#hidden_header_key').html(), contents_key : $(val).next().html() };
			ws.send(createWsPostData(reqParam, "vote"));
		}
	}
	/*
	var reqParam = { header_key : $('#hidden_header_key').html(), contents_key : $(val).next().html() };
	ws.send(createWsPostData(reqParam, "vote"));
	*/
}

function createAnswerForManager(val) {
	var reqParam = {
		header_key : $('#hidden_header_key_manager').html(),
		text : $('#input_contents').val()
	};
	ws.send(createWsPostData(reqParam, "create_answer_manager"));
}

// create answers to questions.
function createAnswer(val) {
	if (window.localStorage) {
		if (window.localStorage.getItem(HEADER_KEY_PREFIX + $('#hidden_header_key').html())) {
			$("#modal").modal();
		} else {
			window.localStorage.setItem(HEADER_KEY_PREFIX + $('#hidden_header_key').html(),
				$('#hidden_header_key').html());
			var reqParam = { header_key : $('#hidden_header_key').html(), text : $('#input_contents').val() };
			ws.send(createWsPostData(reqParam, "answer"));
		}
	}
	/*
	var reqParam = { header_key : $('#hidden_header_key').html(), text : $('#input_contents').val() };
	ws.send(createWsPostData(reqParam, "answer"));
	*/
}

// escape method/.
function htmlEscape(s){
	/*
	s=s.replace(/&/g,'\&');
	s=s.replace(/>/g,'\>');
	s=s.replace(/</g,'\<');
	s=s.replace(/"/g,'\"');
	//s=s.replace(/‘/g,'&lsquo');
	//s=s.replace(/’/g,'&rsquo');
	s=s.replace(/'/g,'\'');
	//s=s.replace(///g,'\/');
	s=s.replace(/;/g,'\;');
	*/
	return s;
}

// createa websocket parameter.
function createWsPostData(val, type) {
	var param = {};
	param[type] = val;
	return JSON.stringify(param);
}

// encode form method.
function encodeFormData(data) {
	if (!data) return "";
	var pairs = [];
	for (var name in data) {
		if (!data.hasOwnProperty(name)) continue;
		if (typeof data[name] === "function") continue;
		var value = data[name].toString();
		name = encodeURIComponent(name.replace(" ", "+"));
		value = encodeURIComponent(value.replace(" ", "+"));
		pairs.push(name + "=" + value);
	}
	return pairs.join('&');
}

// for POST
function postData(url, data, callback, contentType) {
	var request = new XMLHttpRequest();
	request.open("POST", url);
	request.onreadystatechange = function() {
		if (request.readyState === 4 && callback) {
			callback(checkContentType(request));
		}
	};
	request.setRequestHeader("Content-Type", contentType);
	request.send(data);
}

// for GET
function getData(url, data, callback) {
	var request = new XMLHttpRequest();
	request.open("GET", url + "?" + encodeFormData(data));
	request.onreadystatechange = function() {
		if (request.readyState === 4 && callback) {
			callback(checkContentType(request));
		}
	};
	request.send(encodeFormData(data));
}

// check response MIME types.
function checkContentType(request) {
	var type = request.getResponseHeader("Content-Type");
	if (type.indexOf("xml") !== -1 && request.responseXML) {
		return request.responseXML;
	} else if (type === "application/json") {
		return JSON.parse(request.responseText);
	} else {
		return request.responseText;
	}
}

// login button clicked.
function onClickLogin() {
	$("#login_message").empty();
	$('#login_user_id').val("");
	$('#login_password').val("");
	$("#login_form").modal();
}

// login action.
function login() {
	var user = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
	var id = $('#login_user_id').val() || user["user_id"];
	var pass = $('#login_password').val() || user["password"];
	var param = {
		user_id : id,
		password : pass,
	};
	postData('/login', JSON.stringify(param), doneLogin, "application/json");
}

// after login.
function doneLogin(data) {
	$("#login_message").empty();
	if (!data["error"] || data.length > 0) {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data[0]));
		window.localStorage.removeItem(USER_SEQUENCE_KEY);
		window.localStorage.removeItem(CURRENT_DISPLAY_KEY);
		createLogoutForm(data[0]["user_id"]);
		createUserQuestions(data[1]);
		$('.close').click();
		$("#create_question_button").show();
		$("#contents_area").fadeOut();
		setTimeout(function() {
			$("#contents_area").empty();
		}, 1000);
	} else {
		$("#login_message").append("<p style='border : red;'><font color='red'>" + data["error"] + "</font></p>");
	}
}
// create account
function account() {
	var input_user_id = $('#login_user_id').val();
	var input_password = $('#login_password').val();
	$("#login_message").empty();
	if (!input_user_id || !input_password) {
		$("#login_message").append("<p style='border : red;'><font color='red'>" + "入力して下さい" + "</font></p>");
		return;
	}
	var param = {
		user_id : input_user_id,
		password : input_password,
	};
	postData('/create/account', JSON.stringify(param), doneCreateAccount, "application/json");
}

// after create account
function doneCreateAccount(data) {
	$("#login_message").empty();
	if (!data["error"] || data.length > 0) {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data[0]));
		window.localStorage.removeItem(USER_SEQUENCE_KEY);
		window.localStorage.removeItem(CURRENT_DISPLAY_KEY);
		createLogoutForm(data[0]["user_id"]);
		createUserQuestions(data[1]);
		$('.close').click();
		$("#create_question_button").show();
		$("#contents_area").fadeOut();
		setTimeout(function() {
			$("#contents_area").empty();
		}, 1000);
	} else {
		$("#login_message").append("<p style='border : red;'><font color='red'>" + "アカウント作成に失敗しました" + "</font></p>");
	}
}

// Login Form.
function createLoginForm() {
	$("#login").empty();
	$("#login").append("<p class='navbar-text pull-right'>"
		+ "<button class='btn' onclick='onClickLogin();'>ログインする</button>"
		+ "</p>");
}

// Logout Form.
function createLogoutForm(user_id) {
	$("#login").empty();
	$("#login").append("<p class='navbar-text pull-right'>"
		+ "ようこそ <span style='cursor: pointer;' class='navbar-link' onclick='onClickLoggedInForm();'>"
		+ user_id + "</span> さん"
		+ "</p>");
}

// Click Login Button.
function onClickLoggedInForm() {
	$("#logged_in_form").modal();
}

// Click Logout Button.
function logout() {
	window.localStorage.removeItem(STORAGE_KEY);
	window.localStorage.removeItem(USER_SEQUENCE_KEY);
	window.localStorage.removeItem(CURRENT_DISPLAY_KEY);
	createLoginForm();
	$("#user_questions").empty();
	$("#create_question_button").hide();
	$(".close").click();
	$("#contents_area").fadeOut();
	setTimeout(function() {
		$("#contents_area").empty();
	}, 1000);
}

// create userQuestions.
function createUserQuestions(data) {
	$("#user_questions").empty();
	if (data && data.length > 0) {
		$("#user_questions").append("<h5>投稿した質問</h5>");
		for (var i = 0; i < data.length; i++) {
			$("#user_questions").append("<div id='user_question_" + data[i]["header_key"] + "'>"
				+ "<span style='cursor : pointer;' onclick='deleteQuestion(this)'>&times&nbsp&nbsp</span>"
				+ "<span style='display:none;'>"
				+ data[i]["header_key"]
				+ "</span>"
				+ data[i]["text"]
				+ "</div>");
		}
	} else {
		$("#user_questions").append("<h5>投稿した質問はありません</h5>");
	}
}

// delete Questions.
function deleteQuestion(val) {
	var key = $(val).next().html();
	var param = {
		header_key : key,
	};
	window.localStorage.setItem(DELETE_KEY, key);
	postData('/delete/question', JSON.stringify(param), doneDeleteQuestion, "application/json");
}

// after delete Questions.
function doneDeleteQuestion() {
	var delete_key = window.localStorage.getItem(DELETE_KEY);
	var curret_display_key = window.localStorage.getItem(CURRENT_DISPLAY_KEY);
	$("#user_question_" + delete_key).remove();
	$("#menu_" + delete_key).remove();
	if (curret_display_key == delete_key) {
		$("#contents_area").fadeOut();
		setTimeout(function() {
			$("#contents_area").empty();
		}, 1000);
		window.localStorage.removeItem(CURRENT_DISPLAY_KEY);
	}
	if ($("#user_questions").children().length == 1) {
		$("#user_questions").empty();
		$("#user_questions").append("<h5>投稿した質問はありません</h5>");
	}
	window.localStorage.removeItem(DELETE_KEY);
}