const ads1x15 = require('node-ads1x15');
const gpio = require('rpi-gpio');
const log = require('./logger.js');
var mqtt = require('mqtt');
var conf = require('./conf.json');

// Init ADC
var adc = new ads1x15(1);
var sps = '250';
var pga = '4096';

// Connect MQTT
var mqc = mqtt.connect('mqtt://' + conf.mqtt.host, {"username": conf.mqtt.user, "password": conf.mqtt.password});
log.event.info('MQTT connecting to ' + conf.mqtt.host)
mqc.on('connect', function () {
   log.event.info('MQTT connected.');
});

// Init Doors
conf.doors.forEach((door) => {
    door.request = null;
    door.ignore = null;

    door.state = {
        target: null,
        current: null,
        last: null,
        moving: 0
    }

    door.homekit = {
        CurrentDoorState: 1,
        TargetDoorState: 1
    }

    log.event.info("Setting up door '" + door.name + "'");

    // Set up Pi output pin
    gpio.setup(door.output, gpio.DIR_OUT, null);

    door.mqtt = {
        timeout: null,
        topics: {
            command: conf.mqtt.topicBase + '/' + door.channel.toString() + '/cmd',
            status: conf.mqtt.topicBase + '/' + door.channel.toString() + '/state',
            homekit: conf.mqtt.topicBase + '/' + door.channel.toString() + '/homekit'
        },
        report: function() {
            // Publish to status topic
            var native = JSON.stringify(door.state);
            log.event.verbose("Door '" + door.name + "': " + native);
            mqc.publish(door.mqtt.topics.status, native, {retain: true, qos: 1});    

            // Publish to homekit topic
            var homekit = JSON.stringify(door.homekit);
            mqc.publish(door.mqtt.topics.homekit, homekit);

            // Report every at least every 60 seconds
            clearTimeout(door.mqtt.timeout);
            door.mqtt.timeout = setTimeout(function() {
                door.mqtt.report();
            }, 60000);
        }
    }

    log.event.info('MQTT subscribing to ' + door.mqtt.topics.command);
    mqc.subscribe(door.mqtt.topics.command, function (err) { });

    mqc.on('message', function(topic, message) {
        if (topic == door.mqtt.topics.command) {
            var cmd = JSON.parse(message);
            var req = {
                level: null,
                diff: door.target ? door.request.diff : null,
                retry: null,
                stalled: 0,
                timers: {}
            }
            if (cmd.stop) {
                if (door.state.moving != 0 || door.request) {
                    // Clear request (if any) and hit the stop button!
                    door.request = null;
                    activate(door);
                }
            } else if (cmd.level != undefined) {
                // Level request
                req.level = cmd.level;
                if (door.state.current < (door.openStop - 10)) req.level = Math.min(req.level, door.openStop);

                if (Math.abs(req.level - door.state.current) > 1) {
                    // Send to door only if
                    if (door.request)
                        door.request.level = req.level;
                    else
                        door.request = req;
                    door.state.target = req.level;
                    return;                    
                } else {
                    log.event.verbose("Door '" + door.name + "': Requested level (" + req.level + ") already achieved.");
                }
            // } else if (cmd.TargetDoorState != undefined) {
            //     // Homekit request
            //     req.level = (1 - cmd.TargetDoorState) * 100;
            //     if (door.state.current < (door.openStop - 10)) {
            //         req.level = Math.min(req.level, door.openStop);
            //         log.event.verbose("Door '" + door.name + "': Restricting max to " + req.level);
            //     }

            //     door.state.target = req.level;

            //     // Send to door
            //     if (door.request) {
            //         if (door.request.timers && door.request.timers.done) {
            //             clearTimeout(door.request.timers.done);
            //             door.request.timers.done = null;
            //         }
            //         door.request.level = req.level;
            //     } else {
            //         door.request = req;
            //     }
            //     door.homekit.TargetDoorState = cmd.TargetDoorState;
            //     log.event.verbose("Current: " + door.homekit.CurrentDoorState + ", Target: " + door.homekit.TargetDoorState + ", Level: " + door.state.current);
            //     if (door.state.current > 1) {
            //         log.event.verbose("Override CurrentDoorState to display 'opening/closing' (homekit)");
            //         door.homekit.CurrentDoorState = 1 - door.homekit.TargetDoorState;
            //     } 
            //     door.mqtt.report();
            //     return;
            } else {
                log.event.info('Unrecognised MQTT command: ' + message);
            }

        }

        if (topic == door.mqtt.topics.homekit) {
            //Homekit action
        }
    });

    // Report initial status
    setTimeout(() => {
        door.mqtt.report();
    }, 2500);

    // Report status every 60 seconds
    // setInterval(() => {
    //     door.mqtt.report();
    // }, 60000);
});

setInterval(() => {
    var i = 0;
    conf.doors.forEach((door) => {
        // Stagger each read by 50ms - lessen liklihood of clashes on the adc multiplexor
	setTimeout(function() {
            doorPos(door);
        }, 50 * i);
        i += 1;
    });

}, 250);

function doorPos(door) {
    if (!adc.busy) {
        adc.readADCSingleEnded(door.input, pga, sps, function (err, data) {
            if (err) {
                log.event.error(err);
            } else {
                r = door.request;
                s = door.state;
                var pos = door.invert == true ? 3300 - data : data;
		        s.data = pos;
                s.current = parseInt(((pos - door.closed) / (door.open - door.closed)) * 10000) / 100;
		        // Ensure it's within the 0-100 range
		        s.current = Math.min(100, Math.max(0, s.current));
                if (s.last == null) {
                    // Runs on startup, or (no last value)
                    s.last = s.current;
                    door.homekit.CurrentDoorState = (s.current < 1) ? 1 : 0;
                    door.homekit.TargetDoorState = door.homekit.CurrentDoorState;
                    return;
                }
                // if (door.ignore) {
                //     // Keeps 'last' updated during ignore phase
                //     log.event.info("Door '" + door.name + "': Ignoring...");
                //     s.last = s.current;
                //     return;
                // }
                //log.event.verbose("(last: " + s.last + ", current: " + s.current + ")");

                if (r) {
                    if (r.timers.done) {
                        s.last = s.current;
                        log.event.verbose("Door '" + door.name + "': Ignoring...");
                        return;
                    }

                    // An active level request exists, keep an eye on it.
                    diff = Math.abs(s.current - r.level)

                    //log.event.info(diff);
                    if (r.diff != null) {
                        // We've already done something, investigate
                        if (!r.timers.rev && diff > r.diff) {
                            // Haven't reversed in the last two seconds, and getting further away from target, nooooo!
                            log.event.info("Door '" + door.name + "': Moving wrong direction, reversing...");
                            door.ignore = true;
                            // Push button to stop door
                            activate(door);
                            // Push button a second time after 1s (to start door again)
                            setTimeout(() => { activate(door) }, 1000);
                            // Start monitoring door again after a further second (reversal takes around 2s, give it 3)
                            r.timers.rev = setTimeout(() => { if (r) r.timers.rev = null }, 3000);
                        } else if (diff <= 1) {
                            // If requested level is not fully open or closed, push the button to stop the door.
                            if (r.level > 0 && r.level < 100) activate(door);
                            log.event.info("Door '" + door.name + "': Requested level (" + r.level + ") achieved.");
                            // Update homekit status now that the level has been achieved
                            door.homekit.CurrentDoorState = (s.current > 1) ? 0 : 1;
                            // Ignore state while things settle down
                            r.timers.done = setTimeout(() => {
                                // Clear the request, then report state
                                door.request = null;
				                door.mqtt.report();
                            }, 2000 );
                        } else if (diff == r.diff && r.stalled > 4) {
                            if (!r.retry) {
                                r.retry = true;
                                r.stalled = 0;
                                activate(door);
                                log.event.info("Door '" + door.name + "': Re-toggle due to suspected stall");
                            } else {
                                log.event.info("Door '" + door.name + "': Request cancelled due to suspected stall");
                                door.request = null;
                            }
                        }
                    } else {
                        log.event.info("Door '" + door.name + "': New request (" + r.level + "), toggle door...");
                        activate(door);
                    }
                    //Need to make sure request still exists before we update diff
                    if (r) {
                        if (Math.abs(r.diff - diff) < 0.2)
                            r.stalled += 1;
                        else
                            r.stalled = 0;
                        r.diff = diff;
                        s.last = s.current;
                    }
                    door.mqtt.report();
                } else {
                    switch (true) {
			            case (Math.abs(s.last - s.current) > 5):
				            log.event.verbose("Door '" + door.name + "': Exessive change " + JSON.stringify(s));
			                //	s.current = s.last;
                        case (Math.abs(s.last - s.current) < 0.2):
                            if (s.moving) {
                                log.event.info("Door '" + door.name + "': Stopped");
                                s.moving = 0; 
                                door.homekit.CurrentDoorState = (s.current > 1) ? 0 : 1;
                                door.homekit.TargetDoorState = door.homekit.CurrentDoorState
                                door.mqtt.report();
                            }
                            break;
                        case (Math.abs(s.last - s.current) > 0.4):
                            if (s.current > s.last) {
                                if (!s.moving) {
                                    log.event.info("Door '" + door.name + "': Opening... (last: " + s.last + ", current: " + s.current + ")");
                                    door.homekit.CurrentDoorState = 1;
                                    door.homekit.TargetDoorState = 0;
                                    s.moving = 1;
                                }
                                door.mqtt.report();
                            } else if (s.current < s.last) {
                                if (!s.moving) {
                                    log.event.info("Door '" + door.name + "': Closing... (last: " + s.last + ", current: " + s.current + ")");
                                    door.homekit.CurrentDoorState = 0;
                                    door.homekit.TargetDoorState = 1;
                                    s.moving = -1; 
                                }
                                door.mqtt.report();
                            }
                            break;
                    }
                }
                s.last = s.current;
            }
        });
    } else {
        setTimeout(() => { doorPos(door) }, 25);
    }
}

function activate(door) {
    log.event.verbose("Door '" + door.name + "': Virtual button press (250ms)");
    gpio.write(door.output, true, (err) => {
        if (err) log.event.error(err);
    });
    setTimeout(() => {
        gpio.write(door.output, false, (err) => {
            if(err) log.event.error(err);
        });
    }, 250);
}
