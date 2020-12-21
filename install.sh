cp mqtt-garage.edit /lib/systemd/system/mqtt-garage.service
chmod 644 /lib/systemd/system/mqtt-garage.service
systemctl daemon-reload
systemctl enable mqtt-garage.service
service mqtt-garage start
