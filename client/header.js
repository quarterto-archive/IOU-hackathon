var queries = {};

function getHospDaytr(hospSearchTerm, gotDaytr) {
	var completeResults = [];
	var requestId =  'request-'+Date.now()+'-'+hospSearchTerm
	Meteor.call('signQuery',{
		requestId: requestId,
		connectorGuids: _.chain(hospconnectrs).values().reject(_.isEmpty).value(),
		input: {'location/topic:name': hospSearchTerm},
		maxPages: 6
	},function(err,signedQuery) {
		if(err) return gotDaytr(err);
		console.log(signedQuery);
		//track the progress of the query
		if(!(requestId in queries)) {
			queries[requestId] = {
				jobsSpawned: 0,
				jobsStarted: 0,
				jobsCompleted: 0,
				finished: false
			};
		}

		io.query(signedQuery,function(message){
			console.log(message);
			switch(message.data.type) {
			case 'SPAWN':
				queries[requestId].jobsSpawned++;
				break;
			case 'INIT':
			case 'START':
				queries[requestId].jobsStarted++;
				break;

			case 'STOP':
				queries[requestId].jobsCompleted++;
				break;
			case 'ERROR':
				queries[requestId].finished = true;
				queries[requestId].error = message.data.data;
				break;
			case 'MESSAGE':
				if('error' in message.data.data) {
					queries[requestId].finished = true;
					queries[requestId].error = message.data.data;
				} else {
					completeResults = completeResults.concat(message.data.data.results);
					
				}
				gotDaytr(queries[requestId].error,message.data.data.results);
				
				break;
				//do something with this: message.data.data.results
			}
			
			queries[requestId].finished =
				queries[requestId].jobsStarted == queries[requestId].jobsCompleted
				&& queries[requestId].jobsSpawned == queries[requestId].jobsStarted -1
				&& queries[requestId].jobsStarted > 0;
			//if we have all the returned data then call this callback to tell 
			if(queries[requestId].finished) {
				console.log("hospital queries finished");
				gotDaytr(queries[requestId].error,completeResults);
				delete queries[requestId];
			}
			
		});
	});
}

function getJobDaytr(jobSearchTerm, gotDaytr) {
	
	console.log("jobsearch:",jobSearchTerm);
	var completeResults = [];
	var requestId =  'request-'+Date.now()+'-'+jobSearchTerm
	Meteor.call('signQuery',{
		requestId: requestId,
		connectorGuids: _.chain(jobconnectrs).values().reject(_.isEmpty).value(),
		input: {'job_title/topic:description': jobSearchTerm},
		maxPages: 100
	},function(err,signedQuery) {
		if(err) return gotDaytr(err);
		console.log(signedQuery);
		//track the progress of the query
		if(!(requestId in queries)) {
			queries[requestId] = {
				jobsSpawned: 0,
				jobsStarted: 0,
				jobsCompleted: 0,
				finished: false
			};
		}

		io.query(signedQuery,function(message){
			console.log(message);
			switch(message.data.type) {
			case 'SPAWN':
				queries[requestId].jobsSpawned++;
				break;
			case 'INIT':
			case 'START':
				queries[requestId].jobsStarted++;
				break;

			case 'STOP':
				queries[requestId].jobsCompleted++;
				break;
			case 'ERROR':
				queries[requestId].finished = true;
				queries[requestId].error = message.data.data;
				break;
			case 'MESSAGE':
				if('error' in message.data.data) {
					queries[requestId].finished = true;
					queries[requestId].error = message.data.data;
				} else {
					completeResults = completeResults.concat(message.data.data.results);
				}
				//do something with this: message.data.data.results
			}
			
			queries[requestId].finished =
				queries[requestId].jobsStarted == queries[requestId].jobsCompleted
				&& queries[requestId].jobsSpawned == queries[requestId].jobsStarted -1
				&& queries[requestId].jobsStarted > 0;
			//if we have all the returned data then call this callback to tell 
			if(queries[requestId].finished) {
				gotDaytr(queries[requestId].error,completeResults);
				delete queries[requestId];
			}
			
		});
	});
}

var heatmap, searchquery, searchcontexts;

Session.set('showsplash',true);
Session.set('searchicon','<i class="icon-search"></i>');
Template.splash.searchIcon = Template.header.searchIcon = function() {
	return Session.get('searchicon');
}
Template.content.showsplash = function() {
	return Session.get('showsplash');
}


searchEvents = {
	"blur input": function(ev) {
		searchquery = ev.target.value;
	},
	"click button": function(ev) {
		ev.preventDefault();
		if(Session.equals('showsplash',true)) Session.set('showsplash',false);
		if(searchquery == null) return;

		$(ev.target).attr('disabled','disabled');
		Session.set('searchicon','<img src="/load.gif">');

		if(heatmap != null) heatmap.setMap(null);
		console.log("jobsearch:",searchquery);
		getJobDaytr(searchquery, function(err,allResults) {
			var jobMapData = [];
			_.chain(allResults)
			.pluck("employment_tenure/person/places_lived/location/topic:name")
			.each(function(locationString) {
				console.log(locationString);
				var geo;
				if(geo = GeocodeResults.findOne({loc:locationString})) {
					console.log("mongo cache hit %s",locationString);
					if(typeof geo == "undefined" || typeof geo.latLng == "undefined" || typeof geo.latLng.Ya == "undefined" || typeof geo.latLng.Za == "undefined") 
					{
						console.log("bad cache result");
					}
					else
					{
						console.log(geo.latLng);
						jobMapData.push(new google.maps.LatLng(geo.latLng.Ya,geo.latLng.Za));
					}
				} else geocodeAddress(locationString,function(err,latLng) {
					if(err) 
					{
						console.log(err);
					}
					else
					{
						GeocodeResults.insert({loc:locationString,latLng:latLng});
						jobMapData.push(latLng);
					}
				});
			});
			heatmap = new google.maps.visualization.HeatmapLayer({
				data: jobMapData,
				radius: 100,
				dissipating: true
			});

			heatmap.setMap(map);
			$(ev.target).removeAttr('disabled');
			Session.set('searchicon','<i class="icon-search"></i>');

		});
	}
};

Template.header.events(searchEvents);
Template.splash.events(searchEvents);
