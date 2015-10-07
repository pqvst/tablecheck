var request = require("request");
var cheerio = require("cheerio");
var async = require("async");


// CHANGE THESE
var USERNAME = "...";
var PASSWORD = "...";
var TWILIO_FROM = "...";
var TWILIO_TO = "...";
var TWILIO_SID = "...";
var TWILIO_AUTH = "...";


// use custom cookie jar
var jar = request.jar();
request = request.defaults({ jar: jar });


// consts
var LOGIN_URL = "https://reservations.momofuku.com/login";
var MAIN_URL = "https://reservations.momofuku.com/";
var RESTO_URL = "https://reservations.momofuku.com/current_reservation/step/resto";
var SLOT_URL = "https://reservations.momofuku.com/current_reservation/step/slot";
var CURR_URL = "https://reservations.momofuku.com/current_reservation";
var NEXT_URL = "https://reservations.momofuku.com/reservations/";
var CLOSED_URL = "https://reservations.momofuku.com/current_reservation/step/closed_reservations";
var ID = "";


var HEADERS = {
	"Slider-Request": true,
	"X-CSRF-Token": "",
	"X-Requested-With": "XMLHttpRequest"
};


console.log("looking for table at momofuku ko ...");


async.waterfall([

	// STEP 1: GET LOGIN
	function (done) {
		console.log("logging into reservation system ...");
		
		request.get({ url: LOGIN_URL }, function (err, resp, body) {
			if (err) return done(err);
			
			// extract auth token
			var $ = cheerio.load(body);
			var CSRF = $("meta[name='csrf-token']").attr("content");
			if (!CSRF) return done("could not find csrf-token");
			HEADERS["X-CSRF-Token"] = CSRF;
			
			done();
		})
	},
	
	// STEP 2: POST LOGIN
	function (done) {
		console.log("submitting login details ...");
		var form = {
			utf8: "✓",
			_method: "patch",
			authenticity_token: HEADERS["X-CSRF-Token"],
			"user[email_address]": USERNAME,
			"user[password]": PASSWORD,
			"commit": "SIGN IN"
		};
		request.post({ url: LOGIN_URL, form: form }, function (err, resp, body) {
			done(err);
		});
	},
	
	// STEP 3: GET MAIN
	function (done) {
		console.log("start reservation process ...");
		request.get({ url: MAIN_URL }, function (err, resp, body) {
			
			// extract auth token
			var $ = cheerio.load(body);
			var CSRF = $("meta[name='csrf-token']").attr("content");
			if (!CSRF) return done("could not find csrf-token");
			HEADERS["X-CSRF-Token"] = CSRF;
			
			done();
		});
	},
	
	// STEP 4: POST SELECTIONS
	function (done) {
		console.log("setting reservation selections ...");
		var form = {
			utf8: "✓",
			_method: "patch",
			authenticity_token: HEADERS["X-CSRF-Token"],
			"reservation_form[restaurant_id]": "4",
			"reservation_form[party_size]": "2",
			"reservation_form[meal_id]": "7",
			"reservation_form[shift_id]": "8"
		};
		request.post({ url: CURR_URL, headers: HEADERS, form: form }, function (err, resp, body) {
			done(err);
		});
	},
	
	// STEP 5: GET SLOT
	function (done) {
		console.log("fetching my reservation id ...");
		request.get({ url: SLOT_URL, headers: HEADERS }, function (err, resp, body) {
			if (err) return done(err);
			
			var $ = cheerio.load(body);
			
			// check if reservations closed
			if ($("#closed-reservations").length > 0) {
				return done("reservations closed");
			}
			
			// extract reservation id
			ID = $("a.next").attr("href").split("/")[2];
			done();
		});
	},
	
	// STEP 6: GET SLOTS
	function (done) {
		console.log("getting available time slots ...");
		
		function check(body) {
			var $ = cheerio.load(body);
			var slots = [];
			var dates = [];
			$(".grid .grid-row").each(function (i, el) {
				if (i == 0) {
					dates = $(".grid-cell", el).map(function (i, el) {
						return $(el).text();
					}).get();
				} else {
					var time = "";
					$(".grid-cell", el).each(function (i, el) {
						if (i == 0) {
							time = $(el).text();
						} else {
							if ($("img", el).length > 0) {
								console.log("n/a", dates[i], time);
							} else if ($("a", el).length > 0) {
								console.log("avail", dates[i], time);
								slots.push({ date: dates[i], time: time });
							}
						}
					});
				}
			});
			return slots;
		}
		
		var dates = [ "2015-10-12", "2015-10-19", "2015-10-27" ];
		async.concatSeries(dates, function (date, done) {
			console.log("checking week", date, "...");
			var url = NEXT_URL + ID + "/week/next?start_date=" + date;
			request.get({ url: url, headers: HEADERS }, function (err, resp, body) {
				if (err) return done(err);
				var slots = check(body);
				done(null, slots);
			});
		}, function (err, slots) {
			done(err, slots);
		});
		
	},

], function (err, slots) {
	if (err) {
		return console.error(err);
	}
	
	if (slots.length == 0) {
		return console.log("no slots available :(");
	}
	
	console.log(slots.length + " slot(s) available!");
	for (var i = 0; i < slots.length; i++) {
		console.log(slots[i].date + " at " + slots[i].time);
	}

	var twilio = require("twilio")(TWILIO_SID, TWILIO_AUTH);
	twilio.makeCall({
		from: TWILIO_FROM,
		to: TWILIO_TO,
		url: 'http://ahoy.twilio.com/voice/api/demo'
	}, function (err, responseData) {
		if (err) console.log(err);
	});
	
});