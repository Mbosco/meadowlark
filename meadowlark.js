var express = require('express');
var app = express();
var fortune = require('./lib/fortune.js');
var formidable = require('formidable');
var credentials = require('./credentials.js');
var nodemailer = require('nodemailer');
var emailService = require('./lib/email.js')(credentials);


/* Email sending

emailService.send('joecustomer@gmail.com', 'Hood River tours on sale today!',
                  'Get \'em while they\'re hot!');
*/

//setup logging based on env
switch(app.get('env')){
case 'development':
    // compact, colorful dev logging
    app.use(require('morgan')('dev'));
    break;
case 'production':
    //module 'express-logger' supports daily log rotation
    app.use(require('express-logger')({
	path: __dirname + '/log/requests.log'
    }));
    break;
}

// setup handlebars view engine
var handlebars = require('express3-handlebars').create({ 
    defaultLayout:'main',
    helpers: {
	section: function(name, options){
	    if(!this._sections) this._sections = {};
	    this._sections[name] = options.fn(this);
	    return null;
	}
    }
});
app.engine('handlebars', handlebars.engine);

app.set('view engine', 'handlebars');
app.set('port', process.env.PORT || 3000);

// middleware
app.use(function(req, res, next){
    //create a domain for this request
    var domain = require('domain').create();
    //handle errors on this domain
    domain.on('error', function(err){
	console.error('DOMAIN ERROR CAUGHT\N', err.stack);
	try{
	    //failsafe shutdown in 5 seconds
	    setTimeout(function(){
		console.error('Failsafe shutdown.');
		process.exit(1);
	    }, 5000);
	    
	    // disconnect from the cluster
	    var worker = require('cluster').worker;
	    if(worker) worker.disconnect();
	    
	    // stop taking new requests
	    server.close();

	    try{
		//attempt to use express error route
		next(err);
	    }catch(err){
		// if Express error route failed, try
		// plain Node response
		console.error('Express error mechanism failed.\n', err.stack);
		res.statusCode = 500;
		res.setHeader('content-type', 'text/plain');
		res.end('Server error.');
	    }
	}catch(err){
	    console.error('Unable to send 500 response.\n', err.stack);
	}
    });
    // add the request and response objects to the domain
    domain.add(req);
    domain.add(res);

    // execute the rest of the request chain in the domain
    domain.run(next);
});
app.use(express.static(__dirname + '/public'));
app.use(require('body-parser')());
app.use(require('cookie-parser')(credentials.cookieSecret));
app.use(require('express-session')());

app.use(function(req, res, next){
    res.locals.showTests = app.get('env') !== 'production' && req.query.test === '1';
    next();
});
app.use(function(req, res, next){
    if(!res.locals.partials) res.locals.partials = {};
    res.locals.partials.weater = getWeatherData();
    next();
});
app.use(function(req, res, next){
    //if there's a flash message, transfer
    //it to the context, then clear it
    res.locals.flash = req.session.flash;
    delete req.session.flash;
    next()
});

// Routes go here
app.get('/', function(req, res){
    res.render('home');
});
app.get('/about', function(req, res){
    res.render('about', { 
	fortune: fortune.getFortune(),
	pageTestScript: '/qa/tests-about.js'
    });
});

app.get('/tours/hood-river', function(req, res){
    res.render('tours/hood-river');
});

app.get('/tours/request-group-rate', function(req, res){
    res.render('tours/request-group-rate');
});

app.get('/thank-you', function(req, res){
    res.render('thank-you');
});

app.get('/newsletter', function(req, res){
    res.render('newsletter', { csrf: 'CSRF token goes here' });
});

app.get('/contest/vacation-photo/', function(req, res){
    var now  = new Date();
    res.render('contest/vacation-photo', {
	year: now.getFullYear(),
	month: now.getMonth()
    });
});

app.get('/fail', function(req, res){
    throw new Error('Nope!');
});
app.get('/epic-fail', function(req, res){
    process.nextTick(function(){
	throw new Error('Kaboom!');
    });
});

app.post('/contest/vacation-photo/:year/:month', function(req, res){
    var form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, files){
	console.log('received fields:');
	console.log(fields);
	console.log('received files');
	console.log(files);
	res.redirect(303, '/thank-you');
    });
});

app.post('/process', function(req, res){
    console.log('Form (from querystring): ' + req.query.form);
    console.log('CSRF token (from hidden form field): ' + req.body._csrf);
    console.log('Name (from visible form field): ' + req.body.name);
    console.log('Email (from visible form field): ' + req.body.email);
    req.session.flash = {
	type: 'success',
	intro: 'Thank you!',
	message: 'You have successfully submitted data',
    }
    res.redirect(303, '/thank-you');
});



//custom 404 page
app.use(function(req, res){
    res.status(404);
    res.render('404');
});

//custom 500 page
app.use(function(req, res){
    res.status(500);
    res.render('500');
});

// error handler
app.use(function(err, req, res, next){
    console.error(err.stack);
    res.status(500).render('500');
});

function startServer(){
    var server = app.listen(app.get('port'), function(){
	console.log('Express started in '+ app.get('env') +
		    ' mode on http://localhost:' + app.get('port') +
		    '; press Ctrl-C to terminate.');
    });
    return server;
}

if(require.main == module){
    // application run directly; start app server
    var server = startServer();
}else{
    // application imported as a module via "require": export function
    module.exports = startServer;
}
function getWeatherData(){
    return {
	locations: [
	    {
		name: 'Portland',
		forecastUrl: 'http://www.wunderground.com/US/OR/Portland.html',
		iconUrl: 'http://icons-ak.wxug.com/i/c/k/cloudy.gif',
		weather: 'Overcast',
		temp: '54.1 F (12.3 C)',
	    },
	    {
		name: 'Bend',
		forecastUrl: 'http://www.wunderground.com/US/OR/Bend.html',
		iconUrl: 'http://icons-ak.wxug.com/i/c/k/partlycloudy.gif',
		weather: 'Partly Cloudy',
		temp: '55.0 F (12.8 C)',
	    },
	    {
		name: 'Manzanita',
		forecastUrl: 'http://www.wunderground.com/US/OR/Manzanita.html',
		iconUrl: 'http://icons-ak.wxug.com/i/c/k/cloudy.gif',
		weather: 'Light Rain',
		temp: '55.0 F (12.8 C)',
	    },
	],
    };
};
