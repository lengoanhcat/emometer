$(document).ready(function() {
    var isChrome = !!window.chrome && !!window.chrome.webstore;
    var isFirefox = typeof InstallTrigger !== 'undefined';
    var isOpera = (!!window.opr && !!opr.addons) || !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;

    if (isChrome || isFirefox || isOpera) {
        JSSDKDemo.init();
        JSSDKDemo.run();
    } else {
        JSSDKDemo.create_alert("incompatible-browser", "Bạn đang sử dụng trình duyệt không được hỗ trợ. Xin hãy chạy chương trình này trên Chrome, Firefox, hoặc Opera.");
    }
});

var JSSDKDemo = (function() {
    var detector = null;
    var capture_frames = false;
    var ready_to_accept_input = true;
    var finished_watching = false;
    var processed_frames = [ [], [], [], [], [], [], [] ];
    var emotion_scores = [ 0, 0, 0 ,0 ,0, 0, 0, 0];
    var frames_since_last_face = 0;
    var face_visible = true;

    var player = null;
    var iframe = null;
    var VIDEO_HEIGHT = 510; // 510
    var VIDEO_WIDTH = 853; // 853
    var VIDEO_VOLUME = 50;
    var VIDEO_LENGTH_THRESHOLD = 5;
    var video_duration_sec = 0;
    var video_duration_ms = 0;
    var video_cutoff_sec = 0;
    var start_time = 0;
    var stop_time = 0;
    var playing = false;

    var stop_capture_timeout = null;
    var time_left_sec = 0;
    var time_buffering_ms = 0;
    var buffer_start_time_ms = 0;

    var emotions = ["joy", "anger", "disgust", "contempt", "surprise", "engagement", "valence"];
    var colors = ["#FFFFFF", "orangered", "deeppink", "yellow", "green", "red", "blue"];
    var selected_emotion = "all";
    var svg_width = 720;

    var x_scale = d3.scale.linear().domain([0, 0]).range([0, svg_width]);
    var y_scale = d3.scale.linear().domain([100, 0]).range([2, 248]);

    var t = null;
    var cursor_interval = null;

    var API_KEY = "AIzaSyCdQbLORhF7PGVJ7DG1tkoVJGgDYwA_o0M";

    var run = function() {
        var facevideo_node = document.getElementById("facevideo-node");
        detector = new affdex.CameraDetector(facevideo_node);
        detector.detectAllEmotions();

        detector.addEventListener("onWebcamConnectSuccess", function() {
            show_message("msg-starting-webcam");
        });

        detector.addEventListener("onWebcamConnectFailure", function() {
            show_message("msg-webcam-failure");
        });

        if (detector && !detector.isRunning) {
            detector.start();
        }

        // get the video element inside the div with id "facevideo-node"
        var face_video = $("#facevideo-node video")[0];
        face_video.addEventListener("playing", function() {
            show_message("msg-detector-status");
        });

        detector.addEventListener("onInitializeSuccess", function() {
            show_message("instructions");      
            $("#face_video_canvas").css("display", "block");
            $("#face_video").css("display", "none");             
        });

        detector.addEventListener("onImageResultsSuccess", function(faces, image, timestamp) {
            // get the time as close to the actual time of the frame as possible
            //  account for time spent buffering
            var fake_timestamp = get_current_time_adjusted();

            if (capture_frames) {
                if (frames_since_last_face > 100 && face_visible) {
                    face_visible = false;
                    create_alert("no-face", "Không tìm được khuôn mặt của bạn. Xin hãy thay đổi vị trí của bạn hoặc chỉnh lại webcam.");
                }

                if (faces.length > 0) {
                    if (!face_visible) {
                        face_visible = true;
                        fade_and_remove("#no-face");
                        $("#lightbox").fadeOut(1000);
                    }
                    frames_since_last_face = 0;
                    emotions.forEach(function(val, idx) {
                        processed_frames[idx].push([fake_timestamp, faces[0].emotions[val]]);
                    });
                    // draw landmarks on faces added by LNAC
                    drawFeaturePoints(image, faces[0].featurePoints);
                } else {
                    frames_since_last_face++;
                    emotions.forEach(function(val, idx) {
                        processed_frames[idx].push([fake_timestamp, 0]);
                    });
                    // draw landmarks on faces added by LNAC
                    drawFeaturePoints(image, []);
                }

                update_plot();
            }
        });
    };

    //Draw the detected facial feature points on the image
    function drawFeaturePoints(img, featurePoints) {
        var contxt = $('#face_video_canvas')[0].getContext('2d');

        var hRatio = contxt.canvas.width / img.width;
        var vRatio = contxt.canvas.height / img.height;
        var ratio = Math.min(hRatio, vRatio);

        contxt.strokeStyle = "#FFFFFF";
        for (var id in featurePoints) {
          contxt.beginPath();
          contxt.arc(featurePoints[id].x,
            featurePoints[id].y, 2, 0, 2 * Math.PI);
          contxt.stroke();
        }
    }

    var start_button_click = function(event) {
        $(".demo-message").hide();
        
        if (ready_to_accept_input) {
            ready_to_accept_input = false;
            var video_id;

            if (event.data == null) {
                var blob = document.getElementById("start-form").value;

                if (blob === "" || blob.includes("http://") || blob.includes("https://")) { // treat as URL
                    video_id = blob.split("v=")[1] || "";
                    var ampersandPosition = video_id.indexOf("&");
                    if (ampersandPosition !== -1) {
                        video_id = video_id.substring(0, ampersandPosition);
                    }
                } else { // treat as search
                    var url = "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&key=" + API_KEY + "&maxResults=10&safeSearch=strict&q=" + blob;
                    http_get_async(url, add_to_search_results);
                }

            } else { // play the video that was clicked
                video_id = event.data.id;
            }

            if (typeof video_id !== "undefined") {
                player.loadVideoById(video_id, 0);

                // turn it on when you want to gointo fullscreen mode
//                 var requestFullScreen = iframe.requestFullScreen || iframe.mozRequestFullScreen || iframe.webkitRequestFullScreen;
//                 if (requestFullScreen) {
//                     requestFullScreen.bind(iframe)();
//                 }        
            }                          
        }
    };

/* Begin of LNAC contribution */

//     function drawPieChart(dataset,pieholder,width,height,radius) {
    // drawPieChart for dataset on pieholder 

    // draw pie chart - v1
//         var svg = d3.select(pieholder).append("svg")
//             .attr("width", width)
//             .attr("height", height)
//             .append("g")
//             .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");

//         var arc = d3.svg.arc()
//                 .outerRadius(radius)
//                 .innerRadius(8);

//         var pie = d3.layout.pie()
//                 .sort(null)
//                 .value(function(d){ return d.value; });

//         var g = svg.selectAll(".fan")
//                 .data(pie(dataset))
//                 .enter()
//                 .append("g")
//                 .attr("class", "fan")

//         g.append("path")
//             .attr("d", arc)
//             .attr("fill", function(d){ return d.data.color; })

//         g.append("text")
//             .style("fill","white")
//             .attr("transform", function(d) {
//                 var _d = arc.centroid(d);
//                 _d[0] *= 2.2;	//multiply by a constant factor
//                 _d[1] *= 2.2;	//multiply by a constant factor
//                 return "translate(" + _d + ")";
//               })
//               .attr("dy", ".50em")
//               .style("text-anchor", "middle")
//               .text(function(d) {
//                 if(d.data.value < 8) {
//                   return '';
//                 }
//                 return d.data.value + '%';
//               });

//     }
/* End of LNAC contribution */

    var begin_capture = function() {
        // take care of gap at beginning
        x_scale = d3.scale.linear().domain([start_time, start_time + video_duration_ms]).range([0, svg_width]);
        emotions.forEach( function(val, idx) {
            processed_frames[idx].push([start_time, 0]);
        });
        update_plot();

        capture_frames = true;

        $("#demo-setup").fadeOut("fast", function() {
            $("#video-container").show();
            init_plot();
            stop_capture_timeout = setTimeout(stop_capture, video_duration_ms);
        });
    };

    var stop_capture = function() {
        stop_time = get_current_time_adjusted();
        capture_frames = false;
        detector.stop();
        $(".alert").hide();

        // focus on message
        $("#lightbox").fadeIn(750, function() {
            // render cursor
            add_cursor();
            track_video();

            // make emotion buttons and player clickable
            //$("#ul-wrapper").css("pointer-events", "");
            $("#player").css("pointer-events", "");

            $("#play-again").fadeIn(500, function() {
                $("#lightbox").one("click", transition_to_playback);
            });

			// It will be put into a function for displaying results
            // compute emotion_scores - v2
            // this version compute the total emotional response after ward
            var num_frames = processed_frames[0].length;
            emotions.forEach(function(val, idx) {    
                if(idx<6) {
                for(var iFrm=0; iFrm < num_frames; iFrm++) {
                    emotion_scores[idx] += processed_frames[idx][iFrm][1];                    
                }}
                else if (idx==6) {
                    for(var iFrm=0; iFrm < num_frames; iFrm++) {
                        var valence_score = processed_frames[idx][iFrm][1];
                        if (valence_score > 0) {
                            emotion_scores[6] += valence_score;                        
                        }
                        else if (valence_score < 0) {
                            emotion_scores[7] += valence_score;
                        }
                    }
                }                   
            });   
            // compute total score
            // only compute total_score of emotional classes
//             var total_emotion_score = 0;
//             for (var iEmo=0; iEmo < 5; iEmo++) {
//                 total_emotion_score += emotion_scores[iEmo];
//             }
            // compute total engagement score
            var engagement_score = emotion_scores[5];
            var pvalence_score = emotion_scores[6];
            var nvalence_score = -1*emotion_scores[7];
            // add window alert
//             window.alert("vui mung: " + Math.round(emotion_scores[0]/total_score*100) + "%\n" + 
//                         "gian du: " + Math.round(emotion_scores[1]/total_score*100) + "%\n" + 
//                         "ghe tom: " + Math.round(emotion_scores[2]/total_score*100) + "%\n" + 
//                         "khinh miet: " + Math.round(emotion_scores[3]/total_score*100) + "%\n" +
//                         "ngac nhien: " + Math.round(emotion_scores[4]/total_score*100) + "%");
            // add numeric results
//             document.getElementById("res1").innerHTML="% Cảm xúc (% thời lượng): </br> Vui mừng: " + Math.round(emotion_scores[0]/num_frames) + "%</br>" + 
//                         "Giận du: " + Math.round(emotion_scores[1]/num_frames) + "%</br>" + 
//                         "Ghê tởm: " + Math.round(emotion_scores[2]/num_frames) + "%</br>" + 
//                         "Nghi ngờ: " + Math.round(emotion_scores[3]/num_frames) + "%</br>" +
//                         "Ngạc nhiên: " + Math.round(emotion_scores[4]/num_frames) + "%</br>" +
// 								"% Thu hút (% thời lượng): </br> Chú ý: " + Math.round(engagement_score/num_frames) + "%</br>" +
//                         "Thích thú: " + Math.round(pvalence_score/num_frames) + "%</br>" + 
//                         "Ghét bỏ " + Math.round(nvalence_score/num_frames) + "%";
                                                                                             
           	// add visualization result in a pie chart form	      
           	var datasetValence = [
           	    {label:"Bình thường", value: 100-Math.round((pvalence_score+nvalence_score)/num_frames), color:"yellow"},
           		{label:"Thích thú", value: Math.round(pvalence_score/num_frames), color:"red"},
           		{label:"Ghét bỏ", value: Math.round(nvalence_score/num_frames), color:"orangered"}
           	];

          	var datasetEmotion = [
           		{label:"Thích thú", value: Math.round(pvalence_score/num_frames), color:"red"},
           		{label:"Ghét bỏ", value: Math.round(nvalence_score/num_frames), color:"orangered"},
           		{label:"Bình thường", value: 100-Math.round((pvalence_score+nvalence_score)/num_frames), color:"yellow"}
           	];
           	
           	// drawPieChart version 1
           	// drawPieChart(datasetValence,"#svg-pie",200,200,100)

            // drawPieChart version 2
            // design options for multiple pie charts 
            d3.select("input[value=\"thai_do\"]").property("checked", true);

            var svg = d3.select("#svg-pie")
                .append("svg")
                .append("g")

            svg.append("g")
                .attr("class", "slices");
            svg.append("g")
                .attr("class", "labelName");
            svg.append("g")
                .attr("class", "labelValue");
            svg.append("g")
                .attr("class", "lines");

            var width = 300,
                height = 300,
                radius = Math.min(width, height) / 2;

            var pie = d3.layout.pie()
                .sort(null)
                .value(function(d) {
                    return d.value;
                });

            var arc = d3.svg.arc()
                .outerRadius(radius * 0.8)
                .innerRadius(radius * 0.4);

            var outerArc = d3.svg.arc()
                .innerRadius(radius * 0.9)
                .outerRadius(radius * 0.9);

            var legendRectSize = (radius * 0.05);
            var legendSpacing = radius * 0.02;


            var div = d3.select("body").append("div").attr("class", "toolTip");

            svg.attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");

            var colorRange = d3.scale.category20();
            var color = d3.scale.ordinal()
                .range(colorRange.range());

            change(datasetValence);

            d3.selectAll("input")
                .on("change", selectDataset);            

            // select dataset 
            function selectDataset()
            {
                var value = this.value;
                if (value == "thai_do")
                {
                    change(datasetValence);
                }
                else if (value == "cam_xuc")
                {
                    change(datasetEmotion);
                }
            }

            // animation for changing one pie chart to another pie chart
            function change(data) {

                /* ------- PIE SLICES -------*/
                var slice = svg.select(".slices").selectAll("path.slice")
                    .data(pie(data), function(d){ return d.data.label });

                slice.enter()
                    .insert("path")
                    .style("fill", function(d) { return color(d.data.label); })
                    .attr("class", "slice");

                slice
                    .transition().duration(1000)
                    .attrTween("d", function(d) {
                        this._current = this._current || d;
                        var interpolate = d3.interpolate(this._current, d);
                        this._current = interpolate(0);
                        return function(t) {
                            return arc(interpolate(t));
                        };
                    })
                slice
                    .on("mousemove", function(d){
                        div.style("left", d3.event.pageX+10+"px");
                        div.style("top", d3.event.pageY-25+"px");
                        div.style("display", "inline-block");
                        div.html((d.data.label)+"<br>"+(d.data.value)+"%");
                    });
                slice
                    .on("mouseout", function(d){
                        div.style("display", "none");
                    });

                slice.exit()
                    .remove();

                var legend = svg.selectAll('.legend')
                    .data(color.domain())
                    .enter()
                    .append('g')
                    .attr('class', 'legend')
                    .attr('transform', function(d, i) {
                        var height = legendRectSize + legendSpacing;
                        var offset =  height * color.domain().length / 2;
                        var horz = -3 * legendRectSize;
                        var vert = i * height - offset;
                        return 'translate(' + horz + ',' + vert + ')';
                    });

                legend.append('rect')
                    .attr('width', legendRectSize)
                    .attr('height', legendRectSize)
                    .style('fill', color)
                    .style('stroke', color);

                legend.append('text')
                    .attr('x', legendRectSize + legendSpacing)
                    .attr('y', legendRectSize - legendSpacing)
                    .text(function(d) { return d; });

//                 /* ------- TEXT LABELS -------*/

//                 var text = svg.select(".labelName").selectAll("text")
//                     .data(pie(data), function(d){ return d.data.label });

//                 text.enter()
//                     .append("text")
//                     .attr("dy", ".35em")
//                     .text(function(d) {
//                         return (d.data.label+": "+d.value+"%");
//                     });

//                 function midAngle(d){
//                     return d.startAngle + (d.endAngle - d.startAngle)/2;
//                 }

//                 text
//                     .transition().duration(1000)
//                     .attrTween("transform", function(d) {
//                         this._current = this._current || d;
//                         var interpolate = d3.interpolate(this._current, d);
//                         this._current = interpolate(0);
//                         return function(t) {
//                             var d2 = interpolate(t);
//                             var pos = outerArc.centroid(d2);
//                             pos[0] = radius * (midAngle(d2) < Math.PI ? 1 : -1);
//                             return "translate("+ pos +")";
//                         };
//                     })
//                     .styleTween("text-anchor", function(d){
//                         this._current = this._current || d;
//                         var interpolate = d3.interpolate(this._current, d);
//                         this._current = interpolate(0);
//                         return function(t) {
//                             var d2 = interpolate(t);
//                             return midAngle(d2) < Math.PI ? "start":"end";
//                         };
//                     })
//                     .text(function(d) {
//                         return (d.data.label+": "+d.value+"%");
//                     });


//                 text.exit()
//                     .remove();

//                 /* ------- SLICE TO TEXT POLYLINES -------*/

//                 var polyline = svg.select(".lines").selectAll("polyline")
//                     .data(pie(data), function(d){ return d.data.label });

//                 polyline.enter()
//                     .append("polyline");

//                 polyline.transition().duration(1000)
//                     .attrTween("points", function(d){
//                         this._current = this._current || d;
//                         var interpolate = d3.interpolate(this._current, d);
//                         this._current = interpolate(0);
//                         return function(t) {
//                             var d2 = interpolate(t);
//                             var pos = outerArc.centroid(d2);
//                             pos[0] = radius * 0.95 * (midAngle(d2) < Math.PI ? 1 : -1);
//                             return [arc.centroid(d2), outerArc.centroid(d2), pos];
//                         };
//                     });

//                 polyline.exit()
//                     .remove();
            };

        });
    };

    var track_video = function() {
        cursor_interval = setInterval(function() {
            if (playing) {
                var x_coord = t(player.getCurrentTime());
                translate_cursor(x_coord);
            }
        }, 50);
    };

    var add_cursor = function() {
        // drag and drop
        var curve = d3.select("#svg-curve");
        var drag_group = curve.append("svg:g").attr("y1", 0).attr("y2", 250).attr("x1", 0).attr("x2", 10).attr("class", "draggable-group");
        drag_group.append("svg:rect").attr("x", -5).attr("y", 0).attr("width", 10).attr("height", 250).attr("class", "draggable-rect");
        drag_group.append("svg:line").attr("class", "cursor cursor-wide").attr("y1", 0).attr("y2", 250).attr("x1", 0).attr("x2", 0);

        drag_group.call(d3.behavior.drag().on("drag", function() {
            var x_coord = d3.event.x;
            var playback_time = t.invert(x_coord);

            if (playback_time < 0) {
                x_coord = 0;
                playback_time = 0;
            } else if (playback_time >= video_cutoff_sec) {
                playback_time = video_cutoff_sec - 0.001;
                x_coord = t(playback_time);
            }

            translate_cursor(x_coord);
            player.seekTo(playback_time);

        }).on("dragstart", function(event) {
            if (playing) {
                clearInterval(cursor_interval);
            }
            $("html, .draggable-rect, line.cursor-wide").css({"cursor": "-webkit-grabbing"});
            $("html, .draggable-rect, line.cursor-wide").css({"cursor": "-moz-grabbing"});
            $("html, .draggable-rect, line.cursor-wide").css({"cursor": "grabbing"});
        }).on("dragend", function() {
            if (playing) {
                track_video();
            }
            $("html").css({"cursor": "default"});
            $(".draggable-rect, line.cursor-wide").css("cursor", "pointer");
        }));

        curve.append("svg:text").attr("class", "time video_current_time").attr("y", 20).attr("x", 5).text("0:00");
        curve.on("click", svg_click);
    };

    var svg_click = function() {
        var x_click = d3.mouse(this)[0];
        var playback_time = t.invert(x_click);

        if (playback_time >= video_cutoff_sec) {
            playback_time = video_cutoff_sec - 0.001;
            x_click = t(playback_time);
        }

        if (playing) {
            clearInterval(cursor_interval);
        }

        translate_cursor(x_click);
        player.seekTo(playback_time);

        if (playing) {
            track_video();
        }
    };

    var path = d3.svg.line().x(function(d, i) {
        return x_scale(d[0])
    }).y(function(d, i) {
        return y_scale(d[1])
    }).interpolate("basis");

    var init_plot = function() {
        var curve = d3.select("#svg-curve");

        // original initial data of 7 emotion basic emotions
        var initial_data = [
            [ [0, 0] ], // joy
            [ [0, 0] ], // anger
            [ [0, 0] ], // disgust
            [ [0, 0] ], // contempt
            [ [0, 0] ], // surprise
            [ [0, 0] ], // engagement
            [ [0, 0] ] // valence
        ];   

        // LNAC added new metrics for TVC
//         var initial_data = [
//             [ [0, 0] ], // joy - hai huoc
//             [ [0, 0] ], // engagement - hap dan             
//             [ [0, 0] ], // trust - tin cay 
//             [ [0, 0] ], // surprise - ngac nhien
//             [ [0, 0] ] // clarity - de hieu
//         ];


        curve.selectAll("path.curve").data(initial_data)
        .enter().append("svg:path")
        .attr("class", "curve")
        .attr("id", function(d, i){return emotions[i]})
        .attr("d", path).attr("stroke", function(d, i) { return colors[i] } )
        .attr("fill", "transparent")
        .attr("stroke-width","2px")
        .attr("stroke-opacity", "1");
    };

    var update_plot = function(message) {
        var curve = d3.select("#svg-curve");
        curve.selectAll("path.curve").data(processed_frames)
            .attr("d", path);
    };

    var translate_cursor = function(x_coord) {
        // translate timeline cursor
        d3.selectAll("#svg-curve .draggable-group").attr("transform", "translate(" + x_coord + ", 0)");

        // render time
        var time = d3.selectAll("#svg-curve text.video_current_time");
        var time_sec = Math.floor(x_coord / svg_width * video_duration_sec);
        var text = text_time(time_sec);
        time.text(text);

        // figure out if flip is necessary
        $("#text-width")[0].innerHTML = text;
        var text_width = $("#text-width")[0].clientWidth;
        var flip_at = svg_width - text_width - 5;

        if (x_coord > flip_at) {
            time.attr("transform", "translate(" + (x_coord - text_width - 10) + ", 0)");
        } else {
            time.attr("transform", "translate(" + x_coord + ", 0)");
        }
    };

    var text_time = function(time_sec) {
        return Math.floor(time_sec / 60) + ":" + ((time_sec % 60 < 10) ? ("0" + time_sec % 60) : time_sec % 60);
    };

    var transition_to_playback = function() {
        $("#lightbox").fadeOut(500);
        $("#btn-play-again").fadeOut(500, function() {
            $(this).replaceWith(function() {
                return $("<button id='btn-play-again' class='btn btn-primary'>Thử lại</button>").fadeIn(500, function() {
                    document.onkeypress = function(event) {
                        if ((event || window.event).charCode == 32) {
                            if (playing) {
                                player.pauseVideo();
                            } else {
                                player.playVideo();
                            }
                        }
                    };

                    $("#btn-play-again").one("click", function() {
                        window.location.reload(false);
                    });
                });
            });
        });
    };

    var no_internet = function() {
        $(".alert").hide();
        create_alert("terminated", "Kết nối Internet của bạn không ổn định. Xin khởi động lại trang web và thử lại.");
    };

    var http_get_async = function(url, callback) {
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.onreadystatechange = function() {
            if (xmlHttp.readyState == 4 && xmlHttp.status == 200) {
                callback(xmlHttp.responseText);
            }
        };
        xmlHttp.open("GET", url, true);
        xmlHttp.send(null);
    };

    var add_to_search_results = function(text) {
        $("#search-results").empty();
        var results = JSON.parse(text);
        var list = results.items;

        // add results
        for (var i = 0; i < list.length; i++) {
            var v = list[i];
            var s = v.snippet;
            var id = v.id.videoId;

            var result = document.createElement("div");
            result.className = "list-group-item";
            result.innerHTML = '<table><tr><td><img class="thumbnail" id="' + id + '" src="' + s.thumbnails.medium.url + '" style="margin-right:15px"></td><td valign="top"><h3>' + s.title + '</h3><span>' + s.description + '</span></td></tr></table>';
            $("#search-results").append(result);
            $("#"+id).click({id: id}, start_button_click);
        }

        // show a message for when no videos were found
        var num_videos = results.pageInfo.totalResults;
        if (num_videos === 0) {
            var message = document.createElement("div");
            message.className = "list-group-item";
            message.innerHTML = '<p>Khong tim duoc video.</p>';
            $("#search-results").append(message);
        }

        // scroll to results
        $("html, body").animate({
            scrollTop: $("#search-results").offset().top - 15
        });

        ready_to_accept_input = true;
    };

    var video_ids = ["qILxQwl37Lg", "U3r0LPMoGPE", "IV_ef2mm4G0", "aNgGPaQObp0", "6XsZ4W5sOJE", "Thf6-faRGI4"];

    var populate_examples = function() {
        video_ids.forEach(function(element, index) {
            var id = "#example-" + index;
            var thumbnail_url = "https://i.ytimg.com/vi/" + video_ids[index] + "/mqdefault.jpg";
            $(id)[0].style.backgroundImage = "url(" + thumbnail_url + ")";
            $(id).click({id: video_ids[index]}, start_button_click);

            var url = "https://www.googleapis.com/youtube/v3/videos?part=snippet&id=" + element + "&key=" + API_KEY;
            http_get_async(url, function(text) {
                var results = JSON.parse(text);
                if (results.items.length > 0) {
                    var title = results.items[0].snippet.title;
                    $(id).hover(function() {
                        this.style.backgroundBlendMode = "overlay";
                        $(this)[0].innerText = title;
                    }, function(){
                        this.style.backgroundBlendMode = "initial";
                        $(this)[0].innerText = "";
                    });
                }
            });
        });
    };

    var get_current_time_adjusted = function() {
        return Date.now() - time_buffering_ms;
    };

    var create_alert = function(id, text) {
        $("#lightbox").fadeIn(500);
        $("<div></div>", {
            id: id,
            class: "alert alert-danger",
            display: "none",
            text: text,
        }).appendTo("#lightbox");
        $("#" + id).css({"text-align": "center", "z-index": 2});
        $("#" + id).fadeIn(1000);
    };

    var show_message = function(id) {
        $(".demo-message").hide();
        $(document.getElementById(id)).fadeIn("fast");
    };

    var fade_and_remove = function(id) {
        $(id).fadeOut(500, function() {
            this.remove();
        });
    };



    return {
        init: function() {
            $("#btn-start").click(start_button_click);
            $("#btn-play-again").one("click", transition_to_playback);

            // add click functionality to enter button
            $("#start-form").keyup(function(event) {
                if (event.keyCode === 13 || event.which === 13) {
                    $("#btn-start").click();
                }
            });

            // "show all" button
            $("#all").css("border", "3px solid #ffcc66");

            $("#all").click(function() {
                // set border
                if (selected_emotion !== "all") {
                    $("#" + selected_emotion).css("border", "");
                    $(this).css("border", "3px solid #ffcc66");
                }
                selected_emotion = "all";

                var curve = d3.select("#svg-curve");
                curve.selectAll("path.curve")
                    .transition()
                    .duration(400)
                    .attr("stroke-opacity", 1.0);
            });

            // populate sample videos
            populate_examples();

            // load IFrame Player API code asynchronously
            setTimeout(function() {
                var tag = document.createElement("script");
                tag.src = "https://www.youtube.com/iframe_api";
                var firstScriptTag = document.getElementsByTagName("script")[0];
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            }, 1000);

            // initialize player
            window.onYouTubeIframeAPIReady = function() {
                player = new YT.Player("player", {
                    height: VIDEO_HEIGHT,
                    width: VIDEO_WIDTH,
                    playerVars: {
                        "controls": 0,
                        "iv_load_policy": 3,
                        "rel": 0,
                        "showinfo": 0
                    },
                    events: {
                        "onError": onPlayerError,
                        "onReady": onPlayerReady,
                        "onStateChange": onPlayerStateChange
                    }
                });

                function onPlayerReady(e) {      
                    iframe = document.getElementById('player');                              
                    return;
                }

                function onPlayerError(event) {
                    show_message("msg-bad-url");
                    player.stopVideo();
                    ready_to_accept_input = true;
                }

                function onPlayerStateChange(event) {
                    var status = event.data;

                    if (!finished_watching) {
                        if (status === YT.PlayerState.PLAYING) {
                            video_duration_sec = player.getDuration();

                            if (video_duration_sec > 0) {
                                if (video_duration_sec > VIDEO_LENGTH_THRESHOLD) {
                                    if (start_time > 0) { // started playing again after buffering
                                        capture_frames = true;
                                        stop_capture_timeout = setTimeout(stop_capture, time_left_sec * 1000);

                                        // add how much time was spent buffering
                                        var buffer_time = Date.now() - buffer_start_time_ms;
                                        time_buffering_ms += buffer_time;

                                    } else { // just started playing from the beginning
                                        start_time = Date.now();
                                        player.setVolume(VIDEO_VOLUME);
                                        video_duration_ms = video_duration_sec * 1000;
                                        video_cutoff_sec = Math.floor(video_duration_sec);
                                        t = d3.scale.linear().domain([0, video_duration_sec]).range([0, svg_width]);
                                        begin_capture();
                                    }
                                }
                                else { // video loads and starts playing but is too short
                                    show_message("msg-short-video");
                                    player.stopVideo();
                                    ready_to_accept_input = true;
                                }
                            }

                        }
                        else if (status === YT.PlayerState.BUFFERING && video_duration_sec > VIDEO_LENGTH_THRESHOLD) { // video is valid but needs to buffer
                            capture_frames = false;
                            clearTimeout(stop_capture_timeout);
                            time_left_sec = video_duration_sec - player.getCurrentTime();

                            // log the time when buffering started
                            buffer_start_time_ms = Date.now();
                        }
                    }

                    if (status === YT.PlayerState.ENDED) {
                        if (!finished_watching) {
                            finished_watching = true;
                        } else {
                            translate_cursor(0);
                        }
                        player.seekTo(0);
                        player.pauseVideo();
                    } else if (status === YT.PlayerState.CUED && video_duration_sec > VIDEO_LENGTH_THRESHOLD && !finished_watching) { // loss of Internet while playing video
                        finished_watching = true;
                        player.stopVideo();
                        clearTimeout(stop_capture_timeout);
                        detector.stop();
                        no_internet();
                    }

                    // make cursor less buggy while video is paused
                    if (status === YT.PlayerState.PLAYING) {
                        playing = true;
                    } else {
                        playing = false;
                    }
                }
            };
        },

        run: run,

        responses: function(clicked_id) {              
            // set border
            if (selected_emotion !== clicked_id) {
                $("#" + selected_emotion).css("border", "");
                $("#" + clicked_id).css("border", "3px solid #ffcc66");
            }
            selected_emotion = clicked_id;

            var curve = d3.select("#svg-curve");
            curve.selectAll("path.curve")
                .transition()
                .duration(400)
                .attr("stroke-opacity", function(d,i) {
                    if (this.id === clicked_id) {
                        return 1.0;
                    } else {
                        return 0.2;
                    }
                });
        },

        create_alert: create_alert
    };
})();
