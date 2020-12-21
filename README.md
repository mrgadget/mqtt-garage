# mqtt-garage
This code provides the bridge between real-world interfaces hanging off a Raspberry Pi, and an MQTT server.  In my case, the messages go through Node-RED into Home Assistant - but you could ultimately throw them at anything.

# The Problem
Nothing. Except the need to automate everything!  I wanted to know what my garage doors were up to.<br/><br/>I had investigated automating them, and wasn't satisfied with reed (or micro) switches at each end of the travel in conjunction with hope-and-pray timer setup to _guess_ what the door was up to.  As such, I set about looking for other options...

# The Solution
## The Idea
After a bit of googling I found [this](http://cocoontech.com/forums/page/articles/_/tutorials/home-automation-tutorials/how-to-build-the-ultimate-garage-door-monitor-r46) article which describes using a [10-turn potentiometer](https://nz.element14.com/bourns/3590s-6-103l/track-resistance-10kohm/dp/2328059) to accurately monitor the status of the door - exactly serving my purpose.

## The Hardware
I started off with a Raspberry Pi Zero W, only because I had one laying around.  Soldered up a circuit bord with a couple of relays driven through transistors, and an ADC card for analog inputs (from the 10-turn pots).
* Raspberry Pi (or anythign to run node with digital outputs and analog inputs)
* ADS1115 ADC - dev board with 2.54mm pin spacing (not just the tiny IC)
* Output relays - I used reed relays and transistors
* 10-turn potentiometer - eg [this](https://nz.element14.com/bourns/3590s-6-103l/track-resistance-10kohm/dp/2328059)
* Rubber stopper - goes in the end of the garage door to turn the pot.

## The Software (this repo)
Pretty basic operation - but in a nutshell, it is;
* Regularly monitoring the door(s), outputs status via MQTT.
* Listening on the _set_ topic for desired level commands - expressed as a % of open state.
* Monitoring the travel, and subsequently toggling the bell-press input on the door (using relay) to stop/start the door's movement to achieve the desired direction of travel.


