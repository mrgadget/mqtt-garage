var winston = require('winston');
var path = require('path');

// Set this to whatever, by default the path of the script
var logPath = __dirname;

const tzOffset = (new Date()).getTimezoneOffset() * 60000; //Timezone offset in milliseconds
var tsFormat = (timeStamp) => ((timeStamp - tzOffset) || (new Date(Date.now() - tzOffset))).toISOString().slice(0, -1);

const myFormat = winston.format.printf(info => {
    //return `${info.timestamp} [${info.level}]: ${info.message}`;,
    return `${tsFormat(info.timestamp)} [${info.level}]: ${info.message}`;
});

const errorLog = winston.createLogger({
    transports: [
        new winston.transports.File({
            filename: path.join(logPath, 'logs/errors.log'),
            level: 'info',
            timestamp: tsFormat,
            format: winston.format.combine(
                winston.format.timestamp(),
                myFormat
            ),
        })
    ]
});

const eventLog = winston.createLogger({
    transports: [
        new winston.transports.File({
            filename: path.join(logPath, 'logs/events.log'),
            level: 'info',
            timestamp: tsFormat,
            format: winston.format.combine(
                winston.format.timestamp(),
                myFormat
            ),
        }),
//        new winston.transports.Console({
//            level: 'verbose',
//            timestamp: tsFormat,
//            format: winston.format.combine(
//                winston.format.timestamp(),
//                winston.format.colorize(),
//                myFormat
//            )
//        })
    ]
});

module.exports = {
    error: errorLog,
    event: eventLog
};
