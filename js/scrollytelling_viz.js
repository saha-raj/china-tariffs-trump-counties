// Placeholder for scrollytelling visualization logic using D3.js and potentially a library like scrollama.

document.addEventListener('DOMContentLoaded', function() {
    console.log("Scrollytelling JS loaded.");
    // TODO: Implement scrollytelling setup and logic here.
}); 

// Scrollytelling visualization logic 
document.addEventListener('DOMContentLoaded', function() {
    console.log("Scrollytelling JS loaded.");

    // --- Configuration ---
    const scrollyContainer = d3.select('#scrollytelling-container');
    const graphicContainer = scrollyContainer.select('#scrolly-graphic');
    const mapContainer = graphicContainer.select('#scrolly-map-container');
    const scatterContainer = graphicContainer.select('#scrolly-scatterplot-container');
    // Get handles for the text above/below map
    const mapTextAbove = mapContainer.select('#scrolly-map-text-above');
    const mapTextBelow = mapContainer.select('#scrolly-map-text-below');

    if (mapContainer.empty() || scatterContainer.empty()) {
        console.error("Scrollytelling graphic containers (#scrolly-map-container or #scrolly-scatterplot-container) not found!");
        return;
    }
    
    // Clear placeholder content from SVG containers only
    mapContainer.select('svg').remove(); // Remove if exists from previous runs
    scatterContainer.select('svg').remove();
    mapContainer.selectAll('p').remove(); // Remove placeholder <p> if still there
    scatterContainer.selectAll('p').remove();

    // --- Visualization Setup ---
    const scrollyViz = (function() {
        let countyData = [];
        let usMapData = null;
        let countyDataByFips = {};
        let fipsToState = {};
        let stateFeatures = [];
        let projection, pathGenerator;
        let mapSvg, scatterSvg;
        let mapPaths, stateHighlightBorder, scatterPoints, annotationGroup, mapAnnotationGroup;
        let x, y;
        let yMin, yMax;
        let currentYMode = 'total'; 
        let topRedCounty = null;
        let topBlueCounty = null;
        let valueColorScale; // Renamed from mapColorScale - Scale for value shading
        let mapColorMin, mapColorMax; // Declare in outer scope

        const scatterMargin = { top: 40, right: 30, bottom: 50, left: 60 }; 
        const mapMargin = { top: 10, right: 10, bottom: 10, left: 10 };
        const plotTopPadding = 20; 
        let mapWidth, mapHeight, scatterWidth, scatterHeight; // Store dimensions

        function setupContainers() {
            const mapContainerWidth = mapContainer.node().clientWidth;
            mapHeight = mapContainer.node().clientHeight || 300; 
            const scatterContainerWidth = scatterContainer.node().clientWidth;
            scatterHeight = scatterContainer.node().clientHeight || 300; 

            mapWidth = mapContainerWidth - mapMargin.left - mapMargin.right;
            mapHeight = mapHeight - mapMargin.top - mapMargin.bottom; // Adjust height for margins
            scatterWidth = scatterContainerWidth - scatterMargin.left - scatterMargin.right;
            scatterHeight = scatterHeight - scatterMargin.top - scatterMargin.bottom;

            // Create SVGs
            mapSvg = mapContainer.append("svg")
                .attr("viewBox", `0 0 ${mapContainerWidth} ${mapContainer.node().clientHeight}`)
                .attr("preserveAspectRatio", "xMidYMid meet")
                .append("g")
                .attr("transform", `translate(${mapMargin.left},${mapMargin.top})`);
            stateHighlightBorder = mapSvg.append("path").attr("class", "scrolly-state-highlight-border").attr("fill", "none").attr("stroke", "#2a324b").attr("stroke-width", 1.5).style("pointer-events", "none").attr("d", null);
            // Add group for map annotations
            mapAnnotationGroup = mapSvg.append("g").attr("class", "scrolly-map-annotations");

            scatterSvg = scatterContainer.append("svg")
                .attr("viewBox", `0 0 ${scatterContainerWidth} ${scatterContainer.node().clientHeight}`)
                .attr("preserveAspectRatio", "xMidYMid meet")
                .append("g")
                .attr("transform", `translate(${scatterMargin.left},${scatterMargin.top})`);
            annotationGroup = scatterSvg.append("g").attr("class", "scrolly-annotations").style("pointer-events", "none");
            
            projection = d3.geoAlbersUsa();
            pathGenerator = d3.geoPath().projection(projection);
            
            // Color Scale Setup moved to init after data is loaded
            // --- REMOVE Color Scale setup from here ---
            /*
            if (!countyData || countyData.length === 0) return; 
            mapColorMin = d3.min(countyData, d => d.total_jobs_affected_2024 > 0 ? d.total_jobs_affected_2024 : Infinity); 
            mapColorMax = d3.max(countyData, d => d.total_jobs_affected_2024);
            mapColorMin = Math.max(1, isFinite(mapColorMin) ? mapColorMin : 1); 
            mapColorMax = Math.max(1, mapColorMax || 1); 
            valueColorScale = d3.scaleSequentialLog(d3.interpolateRgb("#ffffff", "#767b91")) 
                 .domain([mapColorMin, mapColorMax]);
            console.log(`Scrolly Map Color Scale Setup: Domain=[${mapColorMin}, ${mapColorMax}], Scale Defined=${!!valueColorScale}`);
            */
        }

        function setupColorScale() {
            // Setup Color Scale for Map Value Shading (Total Jobs)
            if (!countyData || countyData.length === 0) return; 

            // EXACT COPY from tariffs_map_plot.js lines 267-270 for domain calculation
            mapColorMin = d3.min(countyData, d => d.total_jobs_affected_2024 > 0 ? d.total_jobs_affected_2024 : Infinity); 
            mapColorMax = d3.max(countyData, d => d.total_jobs_affected_2024);
            mapColorMin = Math.max(1, isFinite(mapColorMin) ? mapColorMin : 1); // Ensure min is at least 1 and finite
            mapColorMax = Math.max(1, mapColorMax || 1); // Ensure max is at least 1 (Reverted to this exact logic)
            // End Exact Copy
             
            // EXACT COPY from tariffs_map_plot.js line 278 (using valueColorScale name)
            valueColorScale = d3.scaleSequentialLog(d3.interpolateRgb("#ffffff", "#767b91")) 
                 .domain([mapColorMin, mapColorMax]);

            // DEBUG LOG
            console.log(`Scrolly Map Color Scale Setup: Domain=[${mapColorMin}, ${mapColorMax}], Scale Defined=${!!valueColorScale}`);
        }

        function processData(csvData) {
            const processed = csvData.map(d => {
                const trumpPct = +d.Trump_Pct;
                const affectedJobsPctRaw = +d.Affected_Jobs_Pct_of_Total_Votes;
                const harrisPct = +d.Harris_Pct;
                const stateName = d.State;
                const countyFips = d['County FIPS'];
                const totalAffectedJobsRaw = +d.Total_Jobs_Affected_by_Tariffs_2024;

                const minValueForLog = 0.01;
                let affectedJobsPct = Math.max(minValueForLog, affectedJobsPctRaw);
                const totalAffectedJobs = isNaN(totalAffectedJobsRaw) ? 0 : totalAffectedJobsRaw;

                if (isNaN(trumpPct) || isNaN(harrisPct) || isNaN(affectedJobsPct) || trumpPct < 0 || trumpPct > 100 || harrisPct < 0 || harrisPct > 100 || !stateName || !countyFips) {
                    return null;
                }

                return {
                    county: d.County,
                    state: stateName,
                    fips: String(Number(countyFips)).padStart(5, '0'),
                    trump_pct: trumpPct,
                    harris_pct: harrisPct,
                    affected_jobs_pct: affectedJobsPct,
                    total_jobs_affected_2024: totalAffectedJobs
                };
            }).filter(d => d !== null);

            countyData = processed;
            countyDataByFips = {};
            fipsToState = {};
            processed.forEach(d => {
                countyDataByFips[d.fips] = d;
                fipsToState[d.fips] = d.state;
            });
        }

        function scrolly_getPointColor(d) {
            return d.trump_pct > d.harris_pct ? "#f76369" : "#1b98e0";
        }

        function scrolly_findMaxCounties(data, mode) {
             if (!data || data.length === 0) return { maxRed: null, maxBlue: null };
             const yValueField = mode === 'percentage' ? 'affected_jobs_pct' : 'total_jobs_affected_2024';
             let maxRed = null, maxBlue = null, maxRedValue = -Infinity, maxBlueValue = -Infinity;
             data.forEach(d => {
                 const value = d[yValueField];
                 if (typeof value !== 'number' || isNaN(value)) return;
                 const isRed = d.trump_pct > d.harris_pct;
                 if (isRed) { if (value > maxRedValue) { maxRedValue = value; maxRed = d; } }
                 else { if (value > maxBlueValue) { maxBlueValue = value; maxBlue = d; } }
             });
             // Store the found counties globally within this scope
             topRedCounty = maxRed;
             topBlueCounty = maxBlue;
             return { maxRed, maxBlue };
        }

        function scrolly_formatAnnotationValue(value, mode) {
            if (mode === 'percentage') {
                if (value <= 0.01) return '<0.01';
                return d3.format(".1f")(value);
            } else {
                return d3.format(",.0f")(value);
            }
        }

        // Modified to draw EITHER scatter annotations OR map annotations
        function scrolly_drawScatterAnnotations(annotationData, mode, xScale, yScale) {
             annotationGroup.selectAll("*").remove(); 
            const yValueField = mode === 'percentage' ? 'affected_jobs_pct' : 'total_jobs_affected_2024';
            const annotations = [];
            if (annotationData.maxRed) annotations.push({ data: annotationData.maxRed });
            if (annotationData.maxBlue) annotations.push({ data: annotationData.maxBlue });
            const annotationWidth = 250, annotationHeight = 55, yOffset = 15;

            annotations.forEach(anno => {
                const d = anno.data;
                if (!d || !xScale || !yScale) return;
                const pointX = xScale(d.trump_pct);
                let pointY = yScale(d[yValueField]);
                if (isNaN(pointX) || isNaN(pointY)) { console.warn("Invalid scale result for annotation", d); return; }
                if (mode === 'total' && d.total_jobs_affected_2024 === 0) { pointY = yScale(yMin); }
                else if (mode === 'percentage' && d.affected_jobs_pct <= yMin) { pointY = yScale(yMin); }
                if (isNaN(pointY)) { console.warn("Invalid y-scale result after adjustment for annotation", d, yMin); return; }
                const foX = pointX - annotationWidth / 2, foY = pointY - annotationHeight - yOffset;
                const formattedValue = scrolly_formatAnnotationValue(d[yValueField], mode);
                const textLine1 = `${d.county}, ${d.state}`;
                const textLine2 = `Affected jobs: <strong>${formattedValue}</strong>${mode === 'percentage' ? '% of votes cast' : ''}`;
                const fo = annotationGroup.append("foreignObject").attr("x", foX).attr("y", foY).attr("width", annotationWidth).attr("height", annotationHeight).style("opacity", 0);
                fo.append("xhtml:div").style("background-color", "rgba(240, 240, 240, 0.9)").style("padding", "8px").style("border-radius", "5px").style("font-size", "14px").style("font-family", "var(--ui-font), sans-serif").style("color", "#333").style("text-align", "left").style("line-height", "1.4").html(`<div>${textLine1}</div><div>${textLine2}</div>`);
                const line = annotationGroup.append("line").attr("x1", pointX).attr("y1", foY + annotationHeight - 5).attr("x2", pointX).attr("y2", pointY - 4).attr("stroke", "#555").attr("stroke-width", 0.5).attr("stroke-dasharray", "2,2").style("opacity", 0);
                fo.transition().duration(300).style("opacity", 1);
                line.transition().duration(300).style("opacity", 1);
            });
        }
        
        function scrolly_drawMapAnnotations(countiesToHighlight) {
            mapAnnotationGroup.selectAll("*").remove(); // Clear previous
            if (!countiesToHighlight || countiesToHighlight.length === 0 || !projection) return;

            countiesToHighlight.forEach(countyData => {
                if (!countyData || !countyData.fips) return;
                // Find the geometry for this county
                const countyFeature = topojson.feature(usMapData, usMapData.objects.counties).features.find(f => f.id === countyData.fips);
                if (!countyFeature) return;

                const centroid = pathGenerator.centroid(countyFeature);
                if (isNaN(centroid[0]) || isNaN(centroid[1])) return; // Skip if centroid invalid

                mapAnnotationGroup.append("text")
                    .attr("x", centroid[0] + 5) // Offset slightly
                    .attr("y", centroid[1])
                    .attr("text-anchor", "start")
                    .style("font-size", "10px")
                    .style("fill", "#333")
                    .style("paint-order", "stroke") // Draw stroke behind fill
                    .style("stroke", "white")
                    .style("stroke-width", "2px")
                    .style("stroke-linecap", "round")
                    .style("stroke-linejoin", "round")
                    .text(countyData.county);
            });
        }

        // Modified to accept showAnnotations parameter
        function updateScatterplot(dataToShow, mode, showAnnotations) {
            if (!scatterSvg) return;
            scatterSvg.selectAll("g").remove(); // Clear previous elements except the main <g>
            annotationGroup = scatterSvg.append("g").attr("class", "scrolly-annotations").style("pointer-events", "none"); // Recreate group

            currentYMode = mode;
            x = d3.scaleLinear().domain([0, 100]).range([0, scatterWidth]);
            if (mode === 'percentage') {
                 yMin = 0.01;
                 yMax = d3.max(countyData, d => d.affected_jobs_pct) || 100; 
                 y = d3.scaleLog().base(10).domain([yMin, yMax + (yMax * 0.1)]).range([scatterHeight, plotTopPadding]);
             } else { 
                 yMin = d3.min(countyData, d => d.total_jobs_affected_2024 > 0 ? d.total_jobs_affected_2024 : Infinity);
                 yMin = Math.max(1, (isFinite(yMin) ? yMin : 1)); 
                 yMax = d3.max(countyData, d => d.total_jobs_affected_2024) || 1; 
                 yMax = Math.max(yMax, yMin + 1);
                 y = d3.scaleLog().base(10).domain([yMin, yMax + (yMax * 0.1)]).range([scatterHeight, plotTopPadding]);
             }
            if (isNaN(y.domain()[0]) || isNaN(y.domain()[1]) || isNaN(y.range()[0]) || isNaN(y.range()[1])){
                 console.error("Invalid Y scale configuration:", y.domain(), y.range()); return;
            }
            const xAxis = d3.axisBottom(x).tickFormat(d => `${d}%`);
            scatterSvg.append("g").attr("class", "x-axis").attr("transform", `translate(0,${scatterHeight})`).call(xAxis).selectAll("text").style("font-size", "11px").style("fill", "#666").style("font-family", "'JetBrains Mono', monospace");
            let yAxisTicks, yAxisFormat;
            if (mode === 'percentage') { yAxisTicks = [0.01, 0.1, 1, 10, 100]; yAxisFormat = d => d3.format(".2~f")(d) + "%"; }
            else { yAxisTicks = [1, 10, 100, 1000, 10000, 50000]; yAxisFormat = d3.format(","); }
            const yAxis = d3.axisLeft(y).tickValues(yAxisTicks).tickFormat(yAxisFormat);
            scatterSvg.append("g").attr("class", "y-axis").call(yAxis).selectAll("text").style("font-size", "11px").style("fill", "#666").style("font-family", "'JetBrains Mono', monospace");
            scatterSvg.append("g").attr("class", "grid y-grid").call(d3.axisLeft(y).tickValues(yAxisTicks).tickSize(-scatterWidth).tickFormat("")).call(g => g.select(".domain").remove()).selectAll("line").style("stroke", "#e0e0e0").style("stroke-dasharray", "2,2");

            // Points (no changes needed)
             scatterPoints = scatterSvg.append('g').selectAll("circle.dot").data(dataToShow, d => d.fips).join("circle").attr("class", "dot").attr("cx", d => x(d.trump_pct)).attr("cy", d => {const value = mode === 'percentage' ? d.affected_jobs_pct : d.total_jobs_affected_2024; const scaledValue = (mode === 'percentage' && value <= yMin) || (mode === 'total' && value === 0) ? yMin : value; return y(scaledValue); }).attr("r", 3).style("fill", scrolly_getPointColor).style("stroke", "none").style("opacity", 0.7);

            // Conditionally draw annotations
            if (showAnnotations) {
                const annotationData = { maxRed: topRedCounty, maxBlue: topBlueCounty }; // Use stored top counties
                scrolly_drawScatterAnnotations(annotationData, mode, x, y);
            } else {
                 annotationGroup.selectAll("*").remove(); // Ensure removed if not shown
            }
        }

        // Modified to handle display modes and highlights
        function updateMap(displayMode, countiesToHighlightArray) {
             if (!mapSvg || !usMapData || !countyData.length) return; 
            
             const highlightFipsSet = new Set(countiesToHighlightArray?.map(c => c.fips));
             const highlightStateSet = new Set(countiesToHighlightArray?.map(c => c.state));
             
             // Remove previous map annotations
             mapAnnotationGroup.selectAll("*").remove(); 

             // Fit projection (only needs to happen once after data load, but safe here)
             projection.fitSize([mapWidth, mapHeight], topojson.feature(usMapData, usMapData.objects.counties));
             
             // Update or draw map paths
             mapPaths = mapSvg.selectAll("g.counties path.county") // Select within a group
                 .data(topojson.feature(usMapData, usMapData.objects.counties).features, d => d.id)
                 .join(
                     enter => enter.append("path") // Append path within the group
                         .attr("class", "county")
                         .attr("stroke", "#ccc")
                         .attr("stroke-width", 0.5)
                         .each(function(d) { // Join data on enter
                             const fips = d.id;
                             if (countyDataByFips[fips]) {
                                 d.properties = { ...d.properties, data: countyDataByFips[fips] };
                             }
                         }),
                     update => update, // No special update needed here
                     exit => exit.remove()
                 )
                 .attr("d", pathGenerator) // Update path data for all
                 .transition().duration(300) // Animate fill change
                 .attr("fill", d => {
                    const countyProperties = d.properties?.data;
                    if (!countyProperties) return "#eee"; // No data
                    
                    if (displayMode === 'valueShading') {
                         if (!valueColorScale || mapColorMin === undefined) { 
                             console.log("Scale or mapColorMin missing for county", d.id);
                             return "#eee"; // Check scale and calculated min are ready
                         }
                         
                         // EXACT COPY/Adaptation from tariffs_map_plot.js applyCountyStyles lines 670-674 (for yAxisMode == 'total')
                         const value = countyProperties.total_jobs_affected_2024;
                         const safeValue = (value > 0) ? value : mapColorMin; // If value > 0 use it, else use calculated mapColorMin
                         const color = valueColorScale(safeValue); 

                         // --- START DEBUG LOGGING (Conditional) ---
                         if (value > 1 && (!color || color === "rgb(255, 255, 255)")) { // Log if high value gets white or fails
                            console.log(`County ${d.id}: value=${value}, safeValue=${safeValue}, mapColorMin=${mapColorMin}, domain=${valueColorScale.domain()}, color=${color}`);
                         } else if (value <= 0 && color !== "rgb(255, 255, 255)") { // Log if zero/min value is NOT white
                             console.log(`County ${d.id} (Zero): safeValue=${safeValue}, mapColorMin=${mapColorMin}, domain=${valueColorScale.domain()}, color=${color}`);
                         }
                         // --- END DEBUG LOGGING --- 

                         return color || "#eee"; // Fallback color
                         // End Exact Copy/Adaptation

                    } else if (displayMode === 'highlightBorders') {
                        // Revert non-highlighted to standard light gray, highlighted slightly darker
                        return highlightStateSet.has(countyProperties.state) ? "#d8d8d8" : "#eee"; // Use standard light gray
                    } else {
                         return "#eee"; // Default
                    }
                 });
                 
             // Ensure parent group exists for paths
             if (mapSvg.select("g.counties").empty()) {
                 mapPaths.nodes().forEach(node => {
                      if(node && node.parentNode && node.parentNode.nodeName !== 'g') {
                         // This shouldn't happen with .join() if mapSvg exists, but as safety
                         const g = mapSvg.insert('g', ':first-child').attr('class', 'counties');
                         g.node().appendChild(node);
                      } else if (node && !node.parentNode){ 
                           // If node somehow detached, re-append (less likely)
                           const g = mapSvg.select('g.counties'); 
                           if(!g.empty()) g.node().appendChild(node);
                      }
                 });
             } else {
                  mapSvg.select("g.counties").selectAll("path.county")
                      .data(topojson.feature(usMapData, usMapData.objects.counties).features, d => d.id)
                      .join("path"); // Ensure join happens within the group
             }

            // Borders (State and Nation) - Redraw or ensure they exist
             mapSvg.selectAll("path.state-borders, path.nation-border").remove(); // Clear old ones
             mapSvg.append("path").datum(topojson.mesh(usMapData, usMapData.objects.states, (a, b) => a !== b)).attr("class", "state-borders").attr("fill", "none").attr("stroke", "#aaa").attr("stroke-width", 1).attr("d", pathGenerator);
             mapSvg.append("path").datum(topojson.mesh(usMapData, usMapData.objects.nation)).attr("class", "nation-border").attr("fill", "none").attr("stroke", "#767b91").attr("stroke-width", 1).attr("d", pathGenerator);

            // State Highlight Border
            let highlightBorderPathData = null;
            if (displayMode === 'highlightBorders' && countiesToHighlightArray?.length > 0) {
                 let featuresToDraw = stateFeatures.filter(f => highlightStateSet.has(f.properties.name));
                 if(featuresToDraw.length > 0) {
                    // Simple border for the first highlighted state found for now
                    highlightBorderPathData = pathGenerator(featuresToDraw[0]);
                 }
            }
            stateHighlightBorder.attr("d", highlightBorderPathData);
            stateHighlightBorder.raise(); // Bring to front
            
            // Draw Map Annotations if needed
            if (displayMode === 'highlightBorders' && countiesToHighlightArray?.length > 0) {
                scrolly_drawMapAnnotations(countiesToHighlightArray);
            }
        }

        // --- Scene Handlers --- 
        function showScene1a() {
            console.log("Showing Scene 1a");
            updateScatterplot(countyData, currentYMode, false); // No scatter annotations
            updateMap('valueShading', null); // Value shading, no highlights
            mapTextAbove.classed('is-visible', false);
            mapTextBelow.classed('is-visible', false);
        }

        function showScene1b() {
            console.log("Showing Scene 1b");
             const highlightCounties = [topRedCounty, topBlueCounty].filter(Boolean); // Get stored counties
            
            updateScatterplot(countyData, currentYMode, true); // SHOW scatter annotations
            updateMap('highlightBorders', highlightCounties); // Highlight borders + map annotations

            // Update and show text above/below map
            const textAboveContent = `Counties with highest total affected jobs:<br/><b>Red:</b> ${topRedCounty?.county || 'N/A'}, ${topRedCounty?.state || 'N/A'}<br/><b>Blue:</b> ${topBlueCounty?.county || 'N/A'}, ${topBlueCounty?.state || 'N/A'}`;
            const textBelowContent = `<b>${topRedCounty?.county || 'N/A'} Industries:</b> Placeholder... <br/> <b>${topBlueCounty?.county || 'N/A'} Industries:</b> Placeholder...`;
            mapTextAbove.html(textAboveContent).classed('is-visible', true);
            mapTextBelow.html(textBelowContent).classed('is-visible', true);
        }

        // --- Public Methods --- 
        return {
            init: function() {
                setupContainers(); 

                // Chain promises instead of Promise.all for better error isolation
                d3.csv('data/tariffs_industries_votes_county.csv')
                    .then(csvData => {
                        console.log("CSV data loaded.");
                        processData(csvData);

                        // Now load JSON data
                        return d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json');
                    })
                    .then(mapData => {
                        console.log("JSON map data loaded.");
                        usMapData = mapData;
                        console.log("Map data assigned (start):", JSON.stringify(usMapData)?.substring(0, 200));

                        // --- VALIDATE MAP DATA --- 
                        if (!usMapData || typeof usMapData !== 'object' || !usMapData.objects) {
                            console.error("Loaded map data is invalid or missing 'objects' property:", usMapData);
                            mapContainer.html("<p style='color: red; text-align: center; padding: 20px;'>Error: Invalid map data loaded.</p>");
                            return; // Stop processing
                        }
                        // --- END VALIDATION --- 

                        // This line should now be safe if validation passes
                        stateFeatures = topojson.feature(usMapData, usMapData.objects.states).features;
                        
                        // Pre-calculate top counties (total mode)
                        scrolly_findMaxCounties(countyData, 'total'); 
                        
                        // Setup color scale now that data is loaded
                        setupColorScale(); 
                        
                        // DEBUG LOG: Check state before first draw
                        console.log(`Before initial showScene1a: mapColorMin=${mapColorMin}, valueColorScale defined=${!!valueColorScale}`);

                        // Initial draw reflects Scene 1a
                        showScene1a(); 

                        console.log("Scrolly viz initialized and showing Scene 1a.");

                    })
                    .catch(error => {
                        // This catch will now handle errors from EITHER csv or json loading/processing
                        console.error('Error during data loading/processing:', error);
                        graphicContainer.html("<p style='color: red; text-align: center; padding: 20px;'>Error loading visualization data.</p>");
                    });
            },
            showScene1a: showScene1a,
            showScene1b: showScene1b
        };
     })(); // End IIFE
 
// ... (keep init call and scroll handling logic) ...
     // --- Initialize Visualization ---
     scrollyViz.init();
 
     // --- Scroll Position Logic ---
    const wrapper = document.getElementById('scrolly-wrapper');
    function handleScroll() {
        const wrapperNode = wrapper;
        if (!wrapperNode) return;
        const rect = wrapperNode.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const scrollStart = wrapperNode.offsetTop;
        const scrollEnd = scrollStart + wrapperNode.offsetHeight - viewportHeight;
        const currentScroll = window.scrollY;
        let progress = (currentScroll - scrollStart) / (scrollEnd - scrollStart);
        if (currentScroll >= scrollStart && currentScroll <= scrollEnd) {
            progress = Math.max(0, Math.min(1, progress));
        } else if (currentScroll < scrollStart) {
            progress = 0;
        } else { 
            progress = 1;
        }
        // Trigger state change based on progress
        if (progress < 0.5) {
            scrollyViz.showScene1a();
        } else {
            scrollyViz.showScene1b();
        }
    }
    window.addEventListener('scroll', handleScroll);
    handleScroll(); 

    // Resize listener TODO
    // window.addEventListener('resize', () => { });

}); // End DOMContentLoaded 