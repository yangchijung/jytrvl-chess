# Map data licence

`kaohsiung.json` is derived from OpenStreetMap data:

> © OpenStreetMap contributors — https://www.openstreetmap.org/copyright

OpenStreetMap data is available under the Open Database License 1.0 (ODbL):
https://opendatacommons.org/licenses/odbl/1-0/

`kaohsiung.json` is a derived database. It is made available under the same licence, ODbL 1.0. The game shows the attribution "© OpenStreetMap 貢獻者 / © OpenStreetMap contributors" in its help panel.

## How it was made

1. Run the Overpass query in `scripts/osm/kaohsiung.overpassql`, for example at https://overpass-turbo.eu/ (Export → raw OSM data). The OSM base timestamp is recorded in the file's `osmBase`.
2. Convert the result:
   ```
   python3 scripts/osm/build_city.py <overpass.json> src/taxi/world/osm/kaohsiung.json
   ```
   The script needs Python 3 and `shapely` 2.

The game's own artwork, code and the procedural buildings generated from this data are not part of the database.
