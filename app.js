'use strict';

// Framework web
const express = require('express');

// Configuração do formato dos dados trafegados
const bodyParser = require('body-parser');

// Biblioteca para buscar temperatura de cidades
const weatherService = require('weather-js');

// Biblioteca para realizar requisições em serviços web
const https = require('https');

// Transforma objetos JavaScript em parâmetros para a URL
const querystring = require('querystring');

// Uma biblioteca JavaScript para analisar, validar, manipular e formatar datas.
const moment = require('moment');

// Drive para comunicação e execução de comandos no banco de dados Neo4J
const neo4j = require('neo4j');

const googleMapsAPIKey = '<YOUR_GOOGLE_MAP_API_KEY>';

const googlecustomSearchAPIKey = '<YOUR_GOOGLE_API_KEY>';
const wikipidiaCustomSearchID = 'YOUR_CUSTOM_SEARCH_API_KEY';
const globoCustomSearchID = 'YOUR_CUSTOM_SEARCH_API_KEY';

const chuckNorris = require('./chuck-norris.json');
const graphDatabase = require('./neo4j-repository');

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const server = app.listen(process.env.PORT || 8080, () => {
    console.log('Express server listening on port %d in %s mode', server.address().port, app.settings.env);
});

app.get('/', (req, res) => {
    res.status(200).send('Hi EJ');
});

app.post('/', (req, res) => {
    var body = req.body;
    var parameters = body.result.parameters;
    // console.log(body.originalRequest.data.event.user);
    // console.log(body);
    switch (body.result.action) {
        case 'weather':
            var callback = getWeatherStyleResponse(res);
            weather(parameters.city, callback);
            break;

        case 'time-now':
            var callback = getFormatedTime(res);
            weather(parameters.city, callback);
            break;
        case 'info':
            var subject = body.result.parameters.any;
            customSearch(res, subject, wikipidiaCustomSearchID, sendResponse);
            break;
        case 'news':
            var subject = body.result.parameters.any;
            customSearch(res, subject, globoCustomSearchID, sendResponse);
            break;
        case 'user.sad':
            funnyFact(res);
            break;
        case 'dolar':
            cotacao(dollarReal.bind(res));
            break;
        case 'custom':
            customizationBot(body, res);
            break;
        case 'getNews':
            getPersonalizedNewsNews(body, res);
            break;
        default:
            break;
    }
});

function cotacao(callback, moedaRef = 'USD', moedaDest = 'BRL') {
    var params = querystring.stringify({ base: moedaRef });

    // Api de conversão de moedas http://fixer.io/
    https.get({ host: 'api.fixer.io', path: '/latest?' + params }, function(response) {
        var body = '';
        response.on('data', function(d) {
            body += d;
        });
        response.on('end', function() {
            var jsonCotacao = JSON.parse(body);
            var cotacaoDest = jsonCotacao.rates[moedaDest];
            callback(cotacaoDest)
        });
    });
}

function dollarReal(cotacao) {
    var valor = cotacao.toFixed(2).toString().replace(/\./g, ',');
    this.send(JSON.stringify({
        'speech': 'O valor do dólar está cotado em R$ ' + valor + '.',
        'displayText': 'O valor do dólar está cotado em R$ ' + valor + '.'
    }));
}

function weather(location, callback) {
    weatherService.find({ search: location, degreeType: 'C' }, function(err, result) {
        if (err) {
            console.log(err);
        } else {
            callback(result);
        }
    });
}

function getWeatherStyleResponse(res) {
    return function(result) {
        res.send(JSON.stringify({
            'speech': 'A temperatura em ' + result[0].location.name + ' é de ' + result[0].current.temperature + ' ℃',
            'displayText': 'A temperatura em ' + result[0].location.name + ' é de ' + result[0].current.temperature + ' ℃'
        }));
    }
}

function getFormatedTime(res) {
    return function(result) {
        getLocationTime(result, function(resultTime) {

            var timeStampDesiredLocation = resultTime.rawOffset;
            var daylightSave = resultTime.dstOffset;

            moment.locale('pt-BR');
            var timeNow = moment().utc().add((timeStampDesiredLocation + daylightSave), 'seconds').format('dddd, DD [de] MMMM [de] YYYY HH:mm');

            res.send(JSON.stringify({
                'speech': result[0].location.name + ' - ' + timeNow,
                'displayText': result[0].location.name + ' - ' + timeNow
            }));
        })
    }
}

function getLocationTime(result, callback) {
    var latitude = result[0].location.lat;
    var longitude = result[0].location.long;
    var params = querystring.stringify({ location: latitude + ',' + longitude, timestamp: moment().utc().unix(), key: googleMapsAPIKey });

    https.get({
        host: 'maps.googleapis.com',
        method: 'GET',
        path: '/maps/api/timezone/json?' + params
    }, function(response) {
        var body = '';
        response.on('data', function(d) {
            body += d;
        });
        response.on('end', function() {
            var parsed = JSON.parse(body);
            callback(parsed);
        });
    });
}

function customSearch(res, subject, searchKey, callback) {

    var params = querystring.stringify({ key: googlecustomSearchAPIKey, cx: searchKey, q: subject });

    https.get({
        host: 'www.googleapis.com',
        method: 'GET',
        path: '/customsearch/v1?' + params
    }, function(response) {
        var body = '';
        response.on('data', function(d) {
            body += d;
        });
        response.on('end', function() {

            var parsed = JSON.parse(body);

            var richResponses = buildAnswer(parsed);

            var responseToUser = {
                richResponses: richResponses,
                speech: 'Resultado da pesquisa',
                displayText: 'Resultado da pesquisa'
            };

            callback(responseToUser, res);
        })
    });
}

function funnyFact(res) {
    var richResponses = {
        'slack': {
            'text': 'Se alegre um pouco, vai ficar tudo bem :)\n Posso tentar ajudar? Aqui estão alguns fatos sobre Chuck Norris:',
            'attachments': [{
                'fields': []
            }]

        }
    };

    for (var index = 0; index < 3; index++) {
        var factPosition = Math.floor(Math.random() * 41) + 1;

        richResponses.slack.attachments[0].fields.push({
            'title': chuckNorris[factPosition].fact,
            'short': false
        })
    }

    var responseToUser = {
        richResponses: richResponses,
        speech: 'Resultado da pesquisa',
        displayText: 'Resultado da pesquisa'
    };

    sendResponse(responseToUser, res);
}

function getRandomColor() {
    var letters = '0123456789ABCDEF';
    var color = '#';
    for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function buildAnswer(parsed) {
    var itens = parsed.items;
    var size = 5;

    if (itens != null) {
        if (itens.length < size) {
            size = itens.length;
        }

        if (itens == null || itens.length == 0) {
            return {
                'slack': {
                    'text': 'Não encontrei nenhum resultado sobre ' + parsed.queries.request[0].searchTerms,
                }
            };
        } else {

            for (var i = 0; i < size; i++) {
                if (itens[i].pagemap.cse_image == null) {
                    itens[i].pagemap = {
                        "cse_image": [{
                            "src": ""
                        }]
                    }
                }
            }

            var richResponses = {
                'slack': {
                    'text': 'Este são os resultados da pesquisa sobre ' + parsed.queries.request[0].searchTerms,
                    'attachments': []
                }
            };

            for (var index = 0; index < size; index++) {
                richResponses.slack.attachments.push({
                    'color': getRandomColor(),
                    'pretext': '',
                    'title': itens[index].title,
                    'title_link': itens[index].link,
                    'text': itens[index].snippet,
                    'image_url': itens[index].pagemap.cse_image[0].src,
                    'footer': 'Custom search',
                    'footer_icon': ''
                });
            }

            return richResponses;
        }
    } else {
        return {
            'slack': {
                'text': 'Infelizmente ocorreu um erro ao tentar realizar a pesquisa :(',
            }
        };
    }
}

function sendResponse(responseToUser, response) {
    if (typeof responseToUser === 'string') {
        let responseJson = {};
        responseJson.speech = responseToUser;
        responseJson.displayText = responseToUser;
        response.json(responseJson);
    } else {
        let responseJson = {};

        responseJson.speech = responseToUser.speech || responseToUser.displayText;
        responseJson.displayText = responseToUser.displayText || responseToUser.speech;

        responseJson.data = responseToUser.richResponses;

        response.json(responseJson);
    }
}

function customizationBot(requestBody, response) {
    var customizationParams = bindCustomization(requestBody);
    customizationParams.sessionId = requestBody.originalRequest.data.event.user;
    graphDatabase.savePrefs(customizationParams);
}

function getPersonalizedNewsNews(requestBody, response) {
    var id = requestBody.originalRequest.data.event.user;
    graphDatabase.loadPrefs(id)
        .then(customResult => {

            if (customResult == "400") {
                var responseToUser = {
                    speech: 'Infelizmente houve um problema ao tentar recuperar as informações customizadas =(',
                    displayText: 'Infelizmente houve um problema ao tentar recuperar as informações customizadas =('
                };

                sendResponse(responseToUser, response);
            } else {
                var promises = [];

                if (customResult.weatherCity) {
                    promises.push(new Promise(function(resolve, reject) {
                        weather(customResult.cityName, function(result) {
                            resolve({ key: 'weather', result: result });
                        });
                    }));
                }

                if (customResult.dollarNews) {
                    promises.push(new Promise(function(resolve, reject) {
                        cotacao(function(result) {
                            resolve({ key: 'cotacao', result: result });
                        });
                    }));
                }

                if (customResult.cityNews) {
                    promises.push(new Promise(function(resolve, reject) {
                        customSearch(null, customResult.cityName, globoCustomSearchID, function(result) {
                            resolve({ key: 'city', result: result });
                        });
                    }));
                }

                customResult.subjects.forEach(function(element) {
                    if (element != 'não') {
                        promises.push(new Promise(function(resolve, reject) {
                            customSearch(null, element, globoCustomSearchID, function(result) {
                                resolve({ key: 'subject', result: result });
                            });
                        }));
                    }
                }, this);

                Promise.all(promises).then(values => {
                    buildCustomResponse(values, response);
                    console.log(values);
                }, reason => {
                    console.log(reason)
                });
            }
        });
}

function buildCustomResponse(values, response) {
    var richResponses = {
        'slack': {
            'text': 'Estes são os resultados da sua pesquisa customizada',
            'attachments': []
        }
    };

    var weatherNews = values.find(function(obj) {
        return obj.key == 'weather';
    });

    if (weatherNews) {
        richResponses.slack.attachments.push({
            'color': getRandomColor(),
            'pretext': '',
            'title': '',
            'title_link': '',
            'text': 'A temperatura em ' + weatherNews.result[0].location.name + ' é de ' + weatherNews.result[0].current.temperature + ' ℃',
            'image_url': '',
            'footer': '',
            'footer_icon': ''
        });
    }

    var cotacaoNews = values.find(function(obj) {
        return obj.key == 'cotacao';
    });

    if (cotacaoNews) {
        var valor = cotacaoNews.result.toFixed(2).toString().replace(/\./g, ',');
        richResponses.slack.attachments.push({
            'color': getRandomColor(),
            'pretext': '',
            'title': '',
            'title_link': '',
            'text': 'O valor do dólar está cotado em R$ ' + valor + '.',
            'image_url': '',
            'footer': '',
            'footer_icon': ''
        });
    }


    var newsAttachments = values.filter(function(obj) {
        return obj.key == 'city' || obj.key == 'subject';
    });

    if (newsAttachments) {
        newsAttachments.forEach(function(element) {
            if (!element.result.richResponses.slack.attachments) {
                richResponses.slack.attachments.push({
                    'color': getRandomColor(),
                    'pretext': '',
                    'title': '',
                    'title_link': '',
                    'text': element.result.richResponses.slack.text,
                    'image_url': '',
                    'footer': '',
                    'footer_icon': ''
                });
            } else {
                Array.prototype.push.apply(richResponses.slack.attachments, element.result.richResponses.slack.attachments.slice(1, 4));
            }
        }, this);
    }


    var responseToUser = {
        richResponses: richResponses,
        speech: 'Resultado da pesquisa',
        displayText: 'Resultado da pesquisa'
    };

    sendResponse(responseToUser, response);
}

function bindCustomization(requestBody) {
    var contexts = requestBody.result.contexts;
    var customizationObj = {};

    if (contexts != null) {
        contexts.forEach(function(element) {
            if (element.name == 'custom') {
                console.log(element);

                customizationObj.name = element.parameters.name;
                customizationObj.weatherCity = element.parameters.weatherCity.toUpperCase() == 'SIM';
                customizationObj.city = element.parameters.city;
                customizationObj.subject = element.parameters['subject.original'].split(',');
                customizationObj.newsCity = element.parameters.newsCity.toUpperCase() == 'SIM';
                customizationObj.newsDolar = element.parameters.newsDolar.toUpperCase() == 'SIM';
            }
        }, this);
    } else {
        return null;
    }

    console.log(customizationObj);

    return customizationObj;
}