// Global variables for Three.js
let scene, camera, renderer, controls;
let timeline, shiftBar, breakBars = [];
let animationId = null;
let animationPlaying = false;
let animationSpeed = 1.0;
let currentStep = 0;
let calculationSteps = [];
let fontLoader, font;

// Configuration variables
const config = {
    shift: {
        start: new Date('2025-03-14T08:00:00'),
        end: new Date('2025-03-14T16:00:00'),
    },
    breakRule: {
        hours: '04:00',
        minutes: 60,
        numberOfBreaks: 4,
        distributeType: 1, // 1 = MIDDLE, 2 = EVEN, 3 = AFTER_HOURS
        afterHours: '02:00',
        weekday: -1, // -1 = Any day, 0 = Sunday, 1 = Monday, etc.
    },
    visualization: {
        showBreaks: true,
    },
    colors: {
        shift: 0x3498db,
        break: 0xe74c3c,
        timeline: 0x95a5a6,
        text: 0x2c3e50,
        highlight: 0xf39c12
    }
};

// BreakHolder class to match Java implementation
class BreakHolder {
    constructor(begin, end, dummy) {
        this.breakItem = { begin: begin, end: end };
        this.dummy = dummy;
    }

    getBreakItem() {
        return this.breakItem;
    }

    isDummy() {
        return this.dummy;
    }
}

// Helper function to convert hours string to minutes
function hoursToMinutes(hoursStr) {
    const parts = hoursStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

// Initialize the visualization
function init() {
    // Setup Three.js scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);
    
    // Setup camera
    camera = new THREE.PerspectiveCamera(
        60, 
        document.getElementById('visualization').clientWidth / document.getElementById('visualization').clientHeight, 
        0.1, 
        1000
    );
    camera.position.set(0, 0, 25); // Initial position, will be adjusted by updateCamera
    
    // Setup renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(document.getElementById('visualization').clientWidth, document.getElementById('visualization').clientHeight);
    document.getElementById('visualization').appendChild(renderer.domElement);
    
    // Setup controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    // Load font for text
    fontLoader = new THREE.FontLoader();
    fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function(loadedFont) {
        font = loadedFont;
        createVisualization();
        
        // Update camera after visualization is created
        updateCamera();
    });
    
    // Setup event listeners
    setupEventListeners();
    
    // Initial validation
    validateShiftLength();
    validateWeekday();
    
    // Start animation loop
    animate();
}

// Create the visualization elements
function createVisualization() {
    // Clear existing elements
    while(scene.children.length > 0) { 
        scene.remove(scene.children[0]); 
    }
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    
    // Create timeline
    createTimeline();
    
    // Create shift bar
    createShiftBar();
    
    // Reset animation state
    currentStep = 0;
    breakBars = [];
    
    // Generate calculation steps
    generateCalculationSteps();
    
    // Update camera to frame the entire timeline
    updateCamera();
}

// Create timeline representation
function createTimeline() {
    // Create timeline bar
    const timelineGeometry = new THREE.BoxGeometry(20, 0.1, 0.1);
    const timelineMaterial = new THREE.MeshPhongMaterial({ color: config.colors.timeline });
    timeline = new THREE.Mesh(timelineGeometry, timelineMaterial);
    scene.add(timeline);
    
    // Add hour markers and labels
    const shiftStartHour = config.shift.start.getHours();
    const shiftEndHour = config.shift.end.getHours() + (config.shift.end.getMinutes() > 0 ? 1 : 0);
    
    for (let hour = shiftStartHour - 1; hour <= shiftEndHour; hour++) {
        // Create marker
        const markerGeometry = new THREE.BoxGeometry(0.05, 0.5, 0.05);
        const markerMaterial = new THREE.MeshPhongMaterial({ color: config.colors.timeline });
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        
        // Position marker on timeline
        const hourPosition = hourToPosition(hour);
        marker.position.set(hourPosition, 0.3, 0);
        scene.add(marker);
        
        // Add hour label if font is loaded
        if (font) {
            const textGeometry = new THREE.TextGeometry(`${hour}:00`, {
                font: font,
                size: 0.3,
                height: 0.02
            });
            const textMaterial = new THREE.MeshPhongMaterial({ color: config.colors.text });
            const text = new THREE.Mesh(textGeometry, textMaterial);
            textGeometry.computeBoundingBox();
            const textWidth = textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x;
            text.position.set(hourPosition - textWidth / 2, 0.8, 0);
            scene.add(text);
        }
    }
}

// Create shift bar representation
function createShiftBar() {
    // Calculate shift duration and position
    const shiftStart = config.shift.start;
    const shiftEnd = config.shift.end;
    const shiftDuration = (shiftEnd - shiftStart) / (60 * 60 * 1000); // in hours
    const shiftCenter = (timeToPosition(shiftStart) + timeToPosition(shiftEnd)) / 2;
    
    // Create shift bar
    const shiftGeometry = new THREE.BoxGeometry(shiftDuration * 2, 0.5, 0.5);
    const shiftMaterial = new THREE.MeshPhongMaterial({ color: config.colors.shift, transparent: true, opacity: 0.8 });
    shiftBar = new THREE.Mesh(shiftGeometry, shiftMaterial);
    shiftBar.position.set(shiftCenter, 0, 0);
    shiftBar.userData.type = 'shift';
    scene.add(shiftBar);
    
    // Add shift labels if font is loaded
    if (font) {
        // Start time label
        const startTimeText = formatTime(shiftStart);
        const startTextGeometry = new THREE.TextGeometry(`Start: ${startTimeText}`, {
            font: font,
            size: 0.25,
            height: 0.02
        });
        const startTextMaterial = new THREE.MeshPhongMaterial({ color: config.colors.text });
        const startText = new THREE.Mesh(startTextGeometry, startTextMaterial);
        startText.position.set(timeToPosition(shiftStart) - 0.5, -0.8, 0);
        scene.add(startText);
        
        // End time label
        const endTimeText = formatTime(shiftEnd);
        const endTextGeometry = new THREE.TextGeometry(`End: ${endTimeText}`, {
            font: font,
            size: 0.25,
            height: 0.02
        });
        const endTextMaterial = new THREE.MeshPhongMaterial({ color: config.colors.text });
        const endText = new THREE.Mesh(endTextGeometry, endTextMaterial);
        endText.position.set(timeToPosition(shiftEnd) - 2, -0.8, 0);
        scene.add(endText);
        
        // Shift duration label
        const durationText = `Duration: ${shiftDuration.toFixed(1)} hours`;
        const durationTextGeometry = new THREE.TextGeometry(durationText, {
            font: font,
            size: 0.3,
            height: 0.02
        });
        const durationTextMaterial = new THREE.MeshPhongMaterial({ color: config.colors.text });
        const durationTextMesh = new THREE.Mesh(durationTextGeometry, durationTextMaterial);
        durationTextMesh.position.set(shiftCenter - 2, -1.3, 0);
        scene.add(durationTextMesh);
    }
}

// Create a break bar
function createBreakBar(startTime, endTime, index, highlight = false) {
    // Calculate break duration and position
    const breakDuration = (endTime - startTime) / (60 * 60 * 1000); // in hours
    const breakCenter = (timeToPosition(startTime) + timeToPosition(endTime)) / 2;
    
    // Create break bar
    const breakGeometry = new THREE.BoxGeometry(breakDuration * 2, 0.5, 0.5);
    const breakMaterial = new THREE.MeshPhongMaterial({ 
        color: highlight ? config.colors.highlight : config.colors.break, 
        transparent: true, 
        opacity: highlight ? 0.9 : 0.7 
    });
    const breakBar = new THREE.Mesh(breakGeometry, breakMaterial);
    breakBar.position.set(breakCenter, 0, 0.3);
    breakBar.userData.type = 'break';
    scene.add(breakBar);
    
    // Add break labels if font is loaded
    if (font) {
        const breakText = `Break ${index + 1}: ${formatTime(startTime)} - ${formatTime(endTime)} (${(breakDuration * 60).toFixed(0)} min)`;
        const breakTextGeometry = new THREE.TextGeometry(breakText, {
            font: font,
            size: 0.2,
            height: 0.02
        });
        const breakTextMaterial = new THREE.MeshPhongMaterial({ color: config.colors.text });
        const breakTextMesh = new THREE.Mesh(breakTextGeometry, breakTextMaterial);
        
        // Position text above the timeline, with vertical offset based on index
        // This prevents overlap with shift timestamps
        breakTextMesh.position.set(breakCenter - 1, 1.2 + index * 0.3, 0.3);
        scene.add(breakTextMesh);
    }
    
    return breakBar;
}

// Convert hour to position on the timeline
function hourToPosition(hour) {
    return (hour - 12) * 2; // Center around noon
}

// Convert time to position on the timeline
function timeToPosition(time) {
    const hour = time.getHours();
    const minute = time.getMinutes();
    return hourToPosition(hour) + (minute / 60) * 2;
}

// Format time as HH:MM
function formatTime(date) {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

// Generate steps to visualize the calculation process
function generateCalculationSteps() {
    calculationSteps = [];
    
    // Step 1: Get shift information
    calculationSteps.push({
        description: "Step 1: Get Shift Information",
        action: function() {
            const shiftStart = new Date(config.shift.start);
            const shiftEnd = new Date(config.shift.end);
            const shiftLengthInMinutes = (shiftEnd - shiftStart) / (60 * 1000);
            
            updateExplanationText(
                `The method starts by getting the shift information.<br><br>` +
                `Shift start: ${formatTime(shiftStart)}<br>` +
                `Shift end: ${formatTime(shiftEnd)}<br>` +
                `Shift length: ${shiftLengthInMinutes} minutes (${(shiftLengthInMinutes / 60).toFixed(2)} hours)`,
                1, calculationSteps.length
            );
            
            // Highlight the shift to indicate it's being measured
            highlightShift();
        }
    });
    
    // Step 2: Filter applicable break rules
    calculationSteps.push({
        description: "Step 2: Filter Applicable Break Rules",
        action: function() {
            const shiftStart = new Date(config.shift.start);
            const shiftWeekday = shiftStart.getDay(); // 0 = Sunday, 1 = Monday, etc.
            const selectedWeekday = parseInt(config.breakRule.weekday);
            const shiftEnd = new Date(config.shift.end);
            const shiftLengthInMinutes = (shiftEnd - shiftStart) / (60 * 1000);
            const breakRuleHoursInMinutes = hoursToMinutes(config.breakRule.hours);
            
            // Check if the rule is applicable based on weekday and shift length
            const weekdayMatch = selectedWeekday === -1 || selectedWeekday === shiftWeekday;
            const hoursMatch = shiftLengthInMinutes >= breakRuleHoursInMinutes;
            const isApplicable = weekdayMatch && hoursMatch;
            
            // Store the result for later steps
            window.isBreakRuleApplicable = isApplicable;
            
            // Get applicable break rules using the new function
            const applicableBreakRules = getApplicableBreakRules();
            
            updateExplanationText(
                `The method filters break rules based on weekday and minimum shift length.<br><br>` +
                `Shift weekday: ${getDayName(shiftWeekday)} (${shiftWeekday})<br>` +
                `Selected weekday: ${selectedWeekday === -1 ? 'Any day' : getDayName(selectedWeekday) + ' (' + selectedWeekday + ')'}<br>` +
                `Weekday match: ${weekdayMatch ? 'Yes' : 'No'}<br><br>` +
                `Shift length: ${shiftLengthInMinutes} minutes<br>` +
                `Break rule minimum hours: ${breakRuleHoursInMinutes} minutes<br>` +
                `Hours match: ${hoursMatch ? 'Yes' : 'No'}<br><br>` +
                `Rule is applicable: ${isApplicable ? 'Yes' : 'No'}<br><br>` +
                `Number of applicable rules: ${applicableBreakRules.length}`,
                2, calculationSteps.length
            );
        }
    });
    
    // Step 3: Find the closest applicable rule
    calculationSteps.push({
        description: "Step 3: Find Closest Applicable Rule",
        action: function() {
            const shiftStart = new Date(config.shift.start);
            const shiftEnd = new Date(config.shift.end);
            const shiftLengthInMinutes = (shiftEnd - shiftStart) / (60 * 1000);
            const breakRuleHoursInMinutes = hoursToMinutes(config.breakRule.hours);
            
            // If no applicable rules, skip this step
            if (!window.isBreakRuleApplicable) {
                updateExplanationText(
                    `No applicable break rules were found in the previous step, so this step is skipped.<br><br>` +
                    `The method will return without creating any breaks.`,
                    3, calculationSteps.length
                );
                return;
            }
            
            const diff = shiftLengthInMinutes - breakRuleHoursInMinutes;
            
            updateExplanationText(
                `From the applicable rules, the method selects the one with the closest minimum shift length to the actual shift length.<br><br>` +
                `Shift length: ${shiftLengthInMinutes} minutes<br>` +
                `Break rule minimum hours: ${breakRuleHoursInMinutes} minutes<br>` +
                `Difference: ${diff} minutes<br><br>` +
                `In this visualization, we only have one break rule, so it is automatically selected.`,
                3, calculationSteps.length
            );
        }
    });
    
    // Step 4: Calculate break parameters
    calculationSteps.push({
        description: "Step 4: Calculate Break Parameters",
        action: function() {
            // If no applicable rules, skip this step
            if (!window.isBreakRuleApplicable) {
                updateExplanationText(
                    `No applicable break rules were found, so this step is skipped.<br><br>` +
                    `The method will return without creating any breaks.`,
                    4, calculationSteps.length
                );
                return;
            }
            
            const numberOfBreaks = config.breakRule.numberOfBreaks;
            const breakMinutes = config.breakRule.minutes;
            const singleBreakLength = breakMinutes / numberOfBreaks;
            
            // Validate break parameters
            const isValidNumberOfBreaks = numberOfBreaks > 0 && numberOfBreaks <= 4;
            const isValidBreakLength = singleBreakLength > 0;
            
            // Store validation results for later steps
            window.isValidNumberOfBreaks = isValidNumberOfBreaks;
            window.isValidBreakLength = isValidBreakLength;
            window.isValidBreakParameters = isValidNumberOfBreaks && isValidBreakLength;
            
            updateExplanationText(
                `The method calculates the break parameters based on the selected rule.<br><br>` +
                `Number of breaks: ${numberOfBreaks} ${!isValidNumberOfBreaks ? '<strong>(Invalid: must be between 1 and 4)</strong>' : ''}<br>` +
                `Total break minutes: ${breakMinutes}<br>` +
                `Single break length: ${singleBreakLength} minutes ${!isValidBreakLength ? '<strong>(Invalid: must be greater than 0)</strong>' : ''}<br><br>` +
                `${!isValidBreakParameters ? '<strong>Since the break parameters are invalid, the method will return without creating any breaks.</strong>' : ''}`,
                4, calculationSteps.length
            );
        }
    });
    
    // Step 5: Determine distribution type
    calculationSteps.push({
        description: "Step 5: Determine Distribution Type",
        action: function() {
            // If no applicable rules or invalid parameters, skip this step
            if (!window.isBreakRuleApplicable || !window.isValidBreakParameters) {
                updateExplanationText(
                    `${!window.isBreakRuleApplicable ? 'No applicable break rules were found' : 'Invalid break parameters were detected'}, so this step is skipped.<br><br>` +
                    `The method will return without creating any breaks.`,
                    5, calculationSteps.length
                );
                return;
            }
            
            let distributeTypeText;
            switch(config.breakRule.distributeType) {
                case 0: distributeTypeText = "BEGINNING"; break;
                case 1: distributeTypeText = "MIDDLE"; break;
                case 2: distributeTypeText = "END"; break;
                case 3: distributeTypeText = "AFTER_HOURS"; break;
                default: distributeTypeText = "Unknown";
            }
            
            // Store distribution type for validation
            window.distributeType = config.breakRule.distributeType;
            window.isValidDistributeType = config.breakRule.distributeType >= 0 && config.breakRule.distributeType <= 3;
            
            updateExplanationText(
                `Distribution type: ${distributeTypeText} ${!window.isValidDistributeType ? '<strong>(Invalid distribution type)</strong>' : ''}<br><br>` +
                `This determines how breaks will be positioned within the shift:<br>` +
                `- BEGINNING: Breaks start from the beginning of the shift<br>` +
                `- MIDDLE: Breaks are evenly distributed throughout the shift<br>` +
                `- END: Breaks are positioned towards the end of the shift<br>` +
                `- AFTER_HOURS: First break starts after a specified number of hours` +
                `${!window.isValidDistributeType ? '<br><br><strong>Since the distribution type is invalid, the method will return without creating any breaks.</strong>' : ''}`,
                5, calculationSteps.length
            );
        }
    });
    
    // Step 6: Calculate first break position
    calculationSteps.push({
        description: "Step 6: Calculate First Break Position",
        action: function() {
            // If no applicable rules, invalid parameters, or invalid distribute type, skip this step
            if (!window.isBreakRuleApplicable || !window.isValidBreakParameters || !window.isValidDistributeType) {
                updateExplanationText(
                    `Previous validation failed, so this step is skipped.<br><br>` +
                    `The method will return without creating any breaks.`,
                    6, calculationSteps.length
                );
                return;
            }
            
            const shiftStart = new Date(config.shift.start);
            const shiftEnd = new Date(config.shift.end);
            const shiftLengthInMinutes = (shiftEnd - shiftStart) / (60 * 1000);
            const numberOfBreaks = config.breakRule.numberOfBreaks;
            const breakMinutes = config.breakRule.minutes;
            const singleBreakLength = breakMinutes / numberOfBreaks;
            
            let firstBreakStart, minutesBetweenBreaks;
            let explanation = "";
            
            switch(config.breakRule.distributeType) {
                case 0: // BEGINNING
                    firstBreakStart = new Date(shiftStart);
                    minutesBetweenBreaks = shiftLengthInMinutes / numberOfBreaks;
                    explanation = "BEGINNING distribution: First break starts at the beginning of the shift.";
                    break;
                case 1: // MIDDLE
                    const middleOffset = shiftLengthInMinutes / (numberOfBreaks + 1);
                    firstBreakStart = new Date(shiftStart.getTime() + middleOffset * 60 * 1000 - (singleBreakLength / 2) * 60 * 1000);
                    minutesBetweenBreaks = shiftLengthInMinutes / (numberOfBreaks + 1);
                    explanation = "MIDDLE distribution: Breaks are evenly distributed throughout the shift.";
                    break;
                case 2: // END
                    const endOffset = shiftLengthInMinutes / numberOfBreaks;
                    firstBreakStart = new Date(shiftStart.getTime() + endOffset * 60 * 1000 - (2 * singleBreakLength / 2) * 60 * 1000);
                    minutesBetweenBreaks = shiftLengthInMinutes / numberOfBreaks;
                    explanation = "END distribution: Breaks are positioned towards the end of the shift.";
                    break;
                case 3: // AFTER_HOURS
                    const afterHoursTime = config.breakRule.afterHours.split(':');
                    const afterHoursMinutes = parseInt(afterHoursTime[0]) * 60 + parseInt(afterHoursTime[1]);
                    firstBreakStart = new Date(shiftStart.getTime() + afterHoursMinutes * 60 * 1000);
                    minutesBetweenBreaks = parseInt(afterHoursTime[0]) * 60 + singleBreakLength;
                    explanation = `AFTER_HOURS distribution: First break starts ${afterHoursMinutes} minutes after shift start.`;
                    break;
                default:
                    // This shouldn't happen due to previous validation
                    updateExplanationText(
                        `Invalid distribution type detected, so this step is skipped.<br><br>` +
                        `The method will return without creating any breaks.`,
                        6, calculationSteps.length
                    );
                    return;
            }
            
            const firstBreakEnd = new Date(firstBreakStart.getTime() + singleBreakLength * 60 * 1000);
            
            // Store first break information for later steps
            window.firstBreakStart = firstBreakStart;
            window.firstBreakEnd = firstBreakEnd;
            window.minutesBetweenBreaks = minutesBetweenBreaks;
            
            // Check if first break is within shift bounds
            const isFirstBreakValid = firstBreakStart >= shiftStart && firstBreakEnd <= shiftEnd;
            window.isFirstBreakValid = isFirstBreakValid;
            
            if (isFirstBreakValid) {
                // Create first break visualization
                const breakBar = createBreakBar(firstBreakStart, firstBreakEnd, 0, true);
                breakBars.push(breakBar);
                
                updateExplanationText(
                    `${explanation}<br><br>` +
                    `First break: ${formatTime(firstBreakStart)} - ${formatTime(firstBreakEnd)}<br>` +
                    `Minutes between breaks: ${minutesBetweenBreaks.toFixed(0)}<br><br>` +
                    `The first break is valid because it is within the shift bounds.`,
                    6, calculationSteps.length
                );
            } else {
                updateExplanationText(
                    `${explanation}<br><br>` +
                    `First break: ${formatTime(firstBreakStart)} - ${formatTime(firstBreakEnd)}<br>` +
                    `Minutes between breaks: ${minutesBetweenBreaks.toFixed(0)}<br><br>` +
                    `<strong>The first break is invalid because it is outside the shift bounds. The method will return without creating any breaks.</strong>`,
                    6, calculationSteps.length
                );
            }
        }
    });
    
    // Step 7: Calculate remaining breaks
    calculationSteps.push({
        description: "Step 7: Calculate Remaining Breaks",
        action: function() {
            // If previous validations failed, skip this step
            if (!window.isBreakRuleApplicable || !window.isValidBreakParameters || !window.isValidDistributeType || !window.isFirstBreakValid) {
                updateExplanationText(
                    `Previous validation failed, so this step is skipped.<br><br>` +
                    `The method will return without creating any breaks.`,
                    7, calculationSteps.length
                );
                return;
            }
            
            const shiftStart = new Date(config.shift.start);
            const shiftEnd = new Date(config.shift.end);
            const numberOfBreaks = config.breakRule.numberOfBreaks;
            const firstBreakStart = window.firstBreakStart;
            const firstBreakEnd = window.firstBreakEnd;
            const minutesBetweenBreaks = window.minutesBetweenBreaks;
            
            // Calculate and create remaining breaks using the Java implementation's approach
            let explanation = "Remaining breaks are calculated based on the first break and minutes between breaks:<br><br>";
            
            // Create a breakHolderList to match Java implementation
            const breakHolderList = [];
            for (let i = 0; i < 4; i++) {
                breakHolderList.push(new BreakHolder(new Date('2025-03-14T00:00:00'), new Date('2025-03-14T00:00:00'), true));
            }
            
            // Set the first break
            breakHolderList[0] = new BreakHolder(firstBreakStart, firstBreakEnd, false);
            explanation += `Break 1: ${formatTime(firstBreakStart)} - ${formatTime(firstBreakEnd)}<br>`;
            
            // Calculate remaining breaks using switch with fall-through like in Java
            let breakBegin, breakEnd;
            
            switch (numberOfBreaks) {
                case 4:
                    breakBegin = new Date(firstBreakStart.getTime() + minutesBetweenBreaks * 3 * 60 * 1000);
                    breakEnd = new Date(firstBreakEnd.getTime() + minutesBetweenBreaks * 3 * 60 * 1000);
                    if (breakBegin >= shiftStart && breakEnd <= shiftEnd) {
                        breakHolderList[3] = new BreakHolder(breakBegin, breakEnd, false);
                        explanation += `Break 4: ${formatTime(breakBegin)} - ${formatTime(breakEnd)}<br>`;
                    } else {
                        explanation += `Break 4: Outside shift bounds, not created<br>`;
                    }
                case 3:
                    breakBegin = new Date(firstBreakStart.getTime() + minutesBetweenBreaks * 2 * 60 * 1000);
                    breakEnd = new Date(firstBreakEnd.getTime() + minutesBetweenBreaks * 2 * 60 * 1000);
                    if (breakBegin >= shiftStart && breakEnd <= shiftEnd) {
                        breakHolderList[2] = new BreakHolder(breakBegin, breakEnd, false);
                        explanation += `Break 3: ${formatTime(breakBegin)} - ${formatTime(breakEnd)}<br>`;
                    } else {
                        explanation += `Break 3: Outside shift bounds, not created<br>`;
                    }
                case 2:
                    breakBegin = new Date(firstBreakStart.getTime() + minutesBetweenBreaks * 60 * 1000);
                    breakEnd = new Date(firstBreakEnd.getTime() + minutesBetweenBreaks * 60 * 1000);
                    if (breakBegin >= shiftStart && breakEnd <= shiftEnd) {
                        breakHolderList[1] = new BreakHolder(breakBegin, breakEnd, false);
                        explanation += `Break 2: ${formatTime(breakBegin)} - ${formatTime(breakEnd)}<br>`;
                    } else {
                        explanation += `Break 2: Outside shift bounds, not created<br>`;
                    }
                default:
                    break;
            }
            
            // Create visualization for the breaks
            resetBreaks();
            for (let i = 0; i < 4; i++) {
                if (!breakHolderList[i].isDummy()) {
                    const breakItem = breakHolderList[i].getBreakItem();
                    const breakBar = createBreakBar(breakItem.begin, breakItem.end, i, true);
                    breakBars.push(breakBar);
                }
            }
            
            updateExplanationText(`${explanation}`, 7, calculationSteps.length);
        }
    });
    
    // Step 8: Final validation
    calculationSteps.push({
        description: "Step 8: Final Validation and Output",
        action: function() {
            // If previous validations failed, show appropriate message
            if (!window.isBreakRuleApplicable || !window.isValidBreakParameters || !window.isValidDistributeType || !window.isFirstBreakValid) {
                updateExplanationText(
                    `<h3>Break Calculation Summary</h3>` +
                    `<p><strong>Result:</strong> No breaks were created due to validation failures:</p>` +
                    `<ul>` +
                    `${!window.isBreakRuleApplicable ? '<li>No applicable break rules found for this shift</li>' : ''}` +
                    `${window.isBreakRuleApplicable && !window.isValidNumberOfBreaks ? '<li>Invalid number of breaks (must be between 1 and 4)</li>' : ''}` +
                    `${window.isBreakRuleApplicable && !window.isValidBreakLength ? '<li>Invalid break length (must be greater than 0)</li>' : ''}` +
                    `${window.isBreakRuleApplicable && window.isValidBreakParameters && !window.isValidDistributeType ? '<li>Invalid distribution type</li>' : ''}` +
                    `${window.isBreakRuleApplicable && window.isValidBreakParameters && window.isValidDistributeType && !window.isFirstBreakValid ? '<li>First break is outside shift bounds</li>' : ''}` +
                    `</ul>`,
                    8, calculationSteps.length
                );
                return;
            }
            
            updateExplanationText("The method filters out any dummy breaks and returns the final array of breaks. In the actual implementation, these breaks would be associated with the shift.", 8, calculationSteps.length, true);
            
            // Show final result summary
            const breakMinutes = config.breakRule.minutes;
            const numberOfBreaks = config.breakRule.numberOfBreaks;
            const singleBreakLength = breakMinutes / numberOfBreaks;
            
            let distributeTypeText;
            switch(config.breakRule.distributeType) {
                case 0: distributeTypeText = "BEGINNING"; break;
                case 1: distributeTypeText = "MIDDLE"; break;
                case 2: distributeTypeText = "END"; break;
                case 3: distributeTypeText = "AFTER_HOURS"; break;
                default: distributeTypeText = "Unknown";
            }
            
            const shiftStart = new Date(config.shift.start);
            const shiftEnd = new Date(config.shift.end);
            const shiftLengthInHours = (shiftEnd - shiftStart) / (60 * 60 * 1000);
            
            document.getElementById('explanation-text').innerHTML = `
                <h3>Break Calculation Summary</h3>
                <p><strong>Shift:</strong> ${formatTime(shiftStart)} - ${formatTime(shiftEnd)} (${shiftLengthInHours.toFixed(1)} hours)</p>
                <p><strong>Break Rule:</strong> ${breakMinutes} minutes total, ${numberOfBreaks} breaks</p>
                <p><strong>Distribution:</strong> ${distributeTypeText}</p>
                <p><strong>Single Break Length:</strong> ${singleBreakLength} minutes</p>
                <p><strong>Number of Breaks Created:</strong> ${breakBars.length}</p>
            `;
        }
    });
}

// Animate the calculation steps
function animateCalculationSteps() {
    // Reset any existing breaks
    resetBreaks();
    
    // Define the calculation steps
    calculationSteps = [
        {
            description: "Initialize Break Calculation",
            explanation: "The break calculator starts by validating the shift and break rules. It checks that the shift has valid start and end times, and that the break rules are properly configured.",
            action: function() {
                // No visual change for initialization
            }
        },
        {
            description: "Calculate Shift Duration",
            explanation: "The calculator determines the total duration of the shift in minutes. This is calculated as the time difference between the shift's start and end times.",
            action: function() {
                // Highlight the shift duration
                highlightShift();
            }
        },
        {
            description: "Sort Break Rules by Priority",
            explanation: "Break rules are sorted by priority to ensure that the most important rules are applied first. This is crucial for proper break distribution.",
            action: function() {
                // No visual change for sorting
            }
        },
        {
            description: "Calculate Total Break Time",
            explanation: "Based on the shift duration and break rules, the calculator determines the total time that should be allocated to breaks.",
            action: function() {
                // No visual change for calculation
            }
        },
        {
            description: "Create Break Placeholders",
            explanation: "The calculator creates placeholder break objects that will be positioned within the shift. These placeholders include the break duration but not yet their positions.",
            action: function() {
                // Add break placeholders
                addBreakPlaceholders();
            }
        },
        {
            description: "Position Breaks Within Shift",
            explanation: "The breaks are positioned within the shift according to the distribution type specified in the break rules. This could be 'EVEN', 'START', 'MIDDLE', or 'END'.",
            action: function() {
                // Position the breaks
                positionBreaks();
            }
        },
        {
            description: "Apply Minimum Distance Between Breaks",
            explanation: "The calculator ensures that there is a minimum distance between breaks as specified in the break rules. This prevents breaks from being scheduled too close to each other.",
            action: function() {
                // Adjust break positions for minimum distance
                adjustBreaksForMinimumDistance();
            }
        },
        {
            description: "Finalize Break Calculation",
            explanation: "The method filters out any dummy breaks and returns the final array of breaks. In the actual implementation, these breaks would be associated with the shift.",
            action: function() {
                // Finalize the breaks
                finalizeBreaks();
            }
        }
    ];
    
    // Start the animation
    let currentStep = 0;
    
    function animateNextStep() {
        if (currentStep < calculationSteps.length) {
            const step = calculationSteps[currentStep];
            
            // Update explanation text - only mark as last step if it's the final step
            updateExplanationText(
                step.explanation || step.description, 
                currentStep + 1, 
                calculationSteps.length, 
                currentStep === calculationSteps.length - 1
            );
            
            // Perform the step's action
            step.action();
            
            // Move to the next step
            currentStep++;
            
            // Schedule the next step
            setTimeout(animateNextStep, 2000);
        }
    }
    
    // Start the animation
    animateNextStep();
}

// Reset the visualization by removing all breaks
function resetBreaks() {
    // Remove all break meshes from the scene
    const breakMeshes = scene.children.filter(child => child.userData.type === 'break');
    breakMeshes.forEach(mesh => scene.remove(mesh));
    
    // Clear the breakBars array
    breakBars = [];
    
    // Remove highlight from shift
    const shiftMesh = scene.children.find(child => child.userData.type === 'shift');
    if (shiftMesh) {
        shiftMesh.material.color.set(0x3498db);
        shiftMesh.material.opacity = 0.7;
    }
    
    // Update the scene
    renderer.render(scene, camera);
}

// Update explanation text
function updateExplanationText(text, step, totalSteps, isLastStep = false) {
    const explanationElement = document.getElementById('step-explanation');
    
    // Create or update step header
    let stepHeader = explanationElement.querySelector('.step-header');
    if (!stepHeader) {
        stepHeader = document.createElement('div');
        stepHeader.className = 'step-header';
        
        // Create spinner
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        stepHeader.appendChild(spinner);
        
        // Create pause indicator (initially hidden)
        const pauseIndicator = document.createElement('div');
        pauseIndicator.className = 'pause-indicator';
        stepHeader.appendChild(pauseIndicator);
        
        // Create checkmark (initially hidden)
        const checkmark = document.createElement('div');
        checkmark.className = 'checkmark';
        stepHeader.appendChild(checkmark);
        
        // Create step counter
        const stepCounter = document.createElement('div');
        stepCounter.className = 'step-counter';
        stepHeader.appendChild(stepCounter);
        
        // Create arrow indicator
        const arrowIndicator = document.createElement('div');
        arrowIndicator.className = 'arrow-indicator arrow-up';
        stepHeader.appendChild(arrowIndicator);
        
        explanationElement.appendChild(stepHeader);
        
        // Create steps list container (initially collapsed)
        const stepsList = document.createElement('div');
        stepsList.className = 'steps-list';
        explanationElement.appendChild(stepsList);
        
        // Populate steps list with all calculation steps
        populateStepsList(stepsList);
        
        // Add click event to toggle steps list visibility
        stepHeader.addEventListener('click', function(event) {
            toggleStepsList(explanationElement);
            event.stopPropagation();
        });
    }
    
    // Update step counter
    const stepCounter = stepHeader.querySelector('.step-counter');
    stepCounter.textContent = `Step ${step}/${totalSteps}`;
    
    // Show spinner or checkmark based on whether it's the last step
    const spinner = stepHeader.querySelector('.spinner');
    const pauseIndicator = stepHeader.querySelector('.pause-indicator');
    const checkmark = stepHeader.querySelector('.checkmark');
    
    if (isLastStep) {
        // Hide spinner and pause indicator, show checkmark on the last step
        spinner.style.display = 'none';
        pauseIndicator.style.display = 'none';
        checkmark.style.display = 'block';
    } else if (!animationPlaying) {
        // Show pause indicator when animation is paused
        spinner.style.display = 'none';
        pauseIndicator.style.display = 'block';
        checkmark.style.display = 'none';
    } else {
        // Show spinner during the process
        spinner.style.display = 'block';
        pauseIndicator.style.display = 'none';
        checkmark.style.display = 'none';
    }
    
    // Update explanation text in the current step item
    const activeStep = explanationElement.querySelector(`.step-item[data-step-index="${step}"]`);
    if (activeStep) {
        const stepExplanation = activeStep.querySelector('.step-explanation');
        if (stepExplanation) {
            stepExplanation.innerHTML = text;
        }
    }
    
    // Update active step in the steps list
    updateActiveStep(explanationElement, step);
    
    // Show the explanation
    explanationElement.style.display = 'block';
    
    // Auto-expand the steps list on first display
    const stepsList = explanationElement.querySelector('.steps-list');
    if (!stepsList.classList.contains('expanded')) {
        toggleStepsList(explanationElement);
    }
}

// Populate the steps list with all calculation steps
function populateStepsList(stepsList) {
    calculationSteps.forEach((step, index) => {
        const stepItem = document.createElement('div');
        stepItem.className = 'step-item';
        
        // Create step title
        const stepTitle = document.createElement('div');
        stepTitle.className = 'step-title';
        stepTitle.textContent = step.description;
        stepItem.appendChild(stepTitle);
        
        // Create step explanation subsection
        const stepExplanation = document.createElement('div');
        stepExplanation.className = 'step-explanation';
        stepExplanation.innerHTML = step.explanation || '';
        stepItem.appendChild(stepExplanation);
        
        stepItem.dataset.stepIndex = index + 1;
        
        // Add click event to jump to this step
        stepItem.addEventListener('click', function(event) {
            // Get the step index
            const stepIndex = parseInt(this.dataset.stepIndex);
            
            // Jump to this step in the animation
            jumpToStep(stepIndex);
            
            // Prevent event bubbling to parent
            event.stopPropagation();
        });
        
        stepsList.appendChild(stepItem);
    });
}

// Toggle the visibility of the steps list
function toggleStepsList(explanationElement) {
    const stepsList = explanationElement.querySelector('.steps-list');
    const arrowIndicator = explanationElement.querySelector('.arrow-indicator');
    
    if (stepsList.classList.contains('expanded')) {
        // Collapse
        stepsList.classList.remove('expanded');
        arrowIndicator.classList.remove('arrow-down');
        arrowIndicator.classList.add('arrow-up');
    } else {
        // Expand
        stepsList.classList.add('expanded');
        arrowIndicator.classList.remove('arrow-up');
        arrowIndicator.classList.add('arrow-down');
    }
}

// Update the active step in the steps list
function updateActiveStep(explanationElement, currentStep) {
    const stepItems = explanationElement.querySelectorAll('.step-item');
    
    // Remove active class from all steps
    stepItems.forEach(item => {
        item.classList.remove('active');
        // Remove bold formatting from all steps
        const stepTitle = item.querySelector('.step-title');
        if (stepTitle) {
            stepTitle.style.fontWeight = 'normal';
        }
    });
    
    // Add active class to current step
    const activeStep = explanationElement.querySelector(`.step-item[data-step-index="${currentStep}"]`);
    if (activeStep) {
        activeStep.classList.add('active');
        // Add bold formatting to the active step
        const stepTitle = activeStep.querySelector('.step-title');
        if (stepTitle) {
            stepTitle.style.fontWeight = 'bold';
        }
    }
}

// Jump to a specific step
function jumpToStep(step) {
    // Pause any running animation
    pauseAnimation();
    
    // Set current step
    currentStep = step;
    
    // Reset any in-progress animations
    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    
    // Get the calculation step
    const calculationStep = calculationSteps[currentStep - 1];
    if (!calculationStep) return;
    
    // Update the visualization based on the step
    updateVisualizationForStep(calculationStep);
    
    // Update explanation text
    const isLastStep = currentStep === calculationSteps.length;
    updateExplanationText(calculationStep.explanation, currentStep, calculationSteps.length, isLastStep);
    
    // Update active step in the steps list
    const explanationElement = document.getElementById('step-explanation');
    updateActiveStep(explanationElement, currentStep);
    
    // If we're at the last step, show the checkmark instead of spinner or pause indicator
    if (isLastStep) {
        const spinner = explanationElement.querySelector('.spinner');
        const pauseIndicator = explanationElement.querySelector('.pause-indicator');
        const checkmark = explanationElement.querySelector('.checkmark');
        
        if (spinner && pauseIndicator && checkmark) {
            spinner.style.display = 'none';
            pauseIndicator.style.display = 'none';
            checkmark.style.display = 'block';
        }
    } else {
        // Show pause indicator since we're paused
        const spinner = explanationElement.querySelector('.spinner');
        const pauseIndicator = explanationElement.querySelector('.pause-indicator');
        const checkmark = explanationElement.querySelector('.checkmark');
        
        if (spinner && pauseIndicator && checkmark && checkmark.style.display !== 'block') {
            spinner.style.display = 'none';
            pauseIndicator.style.display = 'block';
            checkmark.style.display = 'none';
        }
    }
}

// Update visualization for a specific step
function updateVisualizationForStep(step) {
    // Clear any existing break bars
    breakBars.forEach(bar => scene.remove(bar));
    breakBars = [];
    
    // Apply the step's action to update the visualization
    if (step && typeof step.action === 'function') {
        step.action();
    }
    
    // Render the scene
    renderer.render(scene, camera);
}

// Setup event listeners for UI controls
function setupEventListeners() {
    // Shift configuration
    document.getElementById('shift-start').addEventListener('change', function(e) {
        config.shift.start = new Date(e.target.value);
        validateShiftLength();
        validateWeekday();
        updateVisualization();
    });
    
    document.getElementById('shift-end').addEventListener('change', function(e) {
        config.shift.end = new Date(e.target.value);
        validateShiftLength();
        validateWeekday();
        updateVisualization();
    });
    
    // Break rule configuration
    document.getElementById('break-hours').addEventListener('change', function(e) {
        config.breakRule.hours = e.target.value;
        validateShiftLength();
        updateVisualization();
    });
    
    document.getElementById('break-minutes').addEventListener('change', function(e) {
        config.breakRule.minutes = parseInt(e.target.value);
        updateVisualization();
    });
    
    document.getElementById('number-of-breaks').addEventListener('change', function(e) {
        config.breakRule.numberOfBreaks = parseInt(e.target.value);
        updateVisualization();
    });
    
    document.getElementById('distribute-type').addEventListener('change', function(e) {
        config.breakRule.distributeType = parseInt(e.target.value);
        
        // Show/hide after-hours input based on distribution type
        const afterHoursGroup = document.querySelector('.after-hours-group');
        afterHoursGroup.style.display = config.breakRule.distributeType === 3 ? 'flex' : 'none';
        
        updateVisualization();
    });
    
    document.getElementById('after-hours').addEventListener('change', function(e) {
        config.breakRule.afterHours = e.target.value;
        updateVisualization();
    });
    
    document.getElementById('show-breaks').addEventListener('change', function(e) {
        config.visualization.showBreaks = e.target.checked;
        updateVisualization();
    });
    
    // Weekday configuration
    document.getElementById('weekday').addEventListener('change', function(e) {
        config.breakRule.weekday = parseInt(e.target.value);
        validateWeekday();
        updateVisualization();
    });
    
    // Animation controls
    document.getElementById('animation-speed').addEventListener('input', function(e) {
        animationSpeed = parseFloat(e.target.value);
    });
    
    document.getElementById('calculate-btn').addEventListener('click', function() {
        resetVisualization();
        playAnimation();
    });
    
    document.getElementById('reset-btn').addEventListener('click', function() {
        resetVisualization();
        camera.position.set(0, 0, 25);
        controls.reset();
    });
    
    document.getElementById('play-animation-btn').addEventListener('click', playAnimation);
    document.getElementById('pause-animation-btn').addEventListener('click', pauseAnimation);
    
    // Initialize after-hours visibility
    const afterHoursGroup = document.querySelector('.after-hours-group');
    afterHoursGroup.style.display = config.breakRule.distributeType === 3 ? 'flex' : 'none';
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

// Function to validate weekday against shift date
function validateWeekday() {
    const shiftStart = new Date(config.shift.start);
    const selectedWeekday = parseInt(config.breakRule.weekday);
    
    // Get the input field
    const weekdaySelect = document.getElementById('weekday');
    const validationMessage = document.getElementById('weekday-validation-message');
    
    // Get animation control buttons
    const playButton = document.getElementById('play-animation-btn');
    const pauseButton = document.getElementById('pause-animation-btn');
    const calculateButton = document.getElementById('calculate-btn');
    const resetButton = document.getElementById('reset-btn');
    
    // If any day is selected (-1), it's always valid
    if (selectedWeekday === -1) {
        // Remove error class from the input field
        weekdaySelect.classList.remove('input-error');
        
        // Clear tooltip
        weekdaySelect.title = '';
        
        // Hide validation message
        validationMessage.style.display = 'none';
        
        return true;
    }
    
    // Get the weekday of the shift start (0 = Sunday, 1 = Monday, etc.)
    const shiftWeekday = shiftStart.getDay();
    
    // Check if selected weekday matches shift weekday
    if (selectedWeekday !== shiftWeekday) {
        // Add error class to the input field
        weekdaySelect.classList.add('input-error');
        
        // Add tooltip
        weekdaySelect.title = `Selected weekday doesn't match the shift date (${getDayName(shiftWeekday)})`;
        
        // Show validation message
        validationMessage.style.display = 'block';
        validationMessage.innerHTML = `
            <div class="alert alert-danger" role="alert">
                <strong>Error:</strong> Selected weekday doesn't match the shift date!<br>
                Shift date: ${shiftStart.toDateString()} (${getDayName(shiftWeekday)})<br>
                Selected: ${getDayName(selectedWeekday)}
            </div>
        `;
        
        // Disable animation control buttons
        if (playButton) playButton.disabled = true;
        if (pauseButton) pauseButton.disabled = true;
        if (calculateButton) calculateButton.disabled = true;
        if (resetButton) resetButton.disabled = true;
        
        return false;
    } else {
        // Remove error class from the input field
        weekdaySelect.classList.remove('input-error');
        
        // Clear tooltip
        weekdaySelect.title = '';
        
        // Hide validation message
        validationMessage.style.display = 'none';
        
        return true;
    }
}

// Helper function to get day name from day number
function getDayName(dayNum) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayNum];
}

// Function to validate shift length against break rule
function validateShiftLength() {
    const shiftStart = new Date(config.shift.start);
    const shiftEnd = new Date(config.shift.end);
    const shiftLengthInMinutes = (shiftEnd - shiftStart) / (60 * 1000);
    const breakRuleHoursInMinutes = hoursToMinutes(config.breakRule.hours);
    
    // Get the input fields
    const shiftStartInput = document.getElementById('shift-start');
    const shiftEndInput = document.getElementById('shift-end');
    const validationMessage = document.getElementById('shift-validation-message');
    
    // Get animation control buttons
    const playButton = document.getElementById('play-animation-btn');
    const pauseButton = document.getElementById('pause-animation-btn');
    const calculateButton = document.getElementById('calculate-btn');
    const resetButton = document.getElementById('reset-btn');
    
    // Check if shift is long enough for breaks
    if (shiftLengthInMinutes < breakRuleHoursInMinutes) {
        // Add error class to the input fields
        shiftStartInput.classList.add('input-error');
        shiftEndInput.classList.add('input-error');
        
        // Add tooltip or error message
        shiftStartInput.title = `Shift must be at least ${config.breakRule.hours} long for breaks`;
        shiftEndInput.title = `Shift must be at least ${config.breakRule.hours} long for breaks`;
        
        // Show validation message
        validationMessage.style.display = 'block';
        validationMessage.innerHTML = `
            <strong>Error:</strong> Shift is too short for breaks!<br>
            Shift length: ${shiftLengthInMinutes.toFixed(0)} minutes<br>
            Minimum required: ${breakRuleHoursInMinutes} minutes (${config.breakRule.hours})
        `;
        
        // Disable animation control buttons
        if (playButton) playButton.disabled = true;
        if (pauseButton) pauseButton.disabled = true;
        if (calculateButton) calculateButton.disabled = true;
        if (resetButton) resetButton.disabled = true;
        
        return false;
    } else {
        // Remove error class from the input fields
        shiftStartInput.classList.remove('input-error');
        shiftEndInput.classList.remove('input-error');
        
        // Clear tooltips
        shiftStartInput.title = '';
        shiftEndInput.title = '';
        
        // Hide validation message
        validationMessage.style.display = 'none';
        
        // Enable animation control buttons
        if (playButton) playButton.disabled = false;
        if (pauseButton) pauseButton.disabled = false;
        if (calculateButton) calculateButton.disabled = false;
        if (resetButton) resetButton.disabled = false;
        
        return true;
    }
}

// Reset the visualization
function resetVisualization() {
    // Stop any running animation
    pauseAnimation();
    
    // Reset step counter
    currentStep = 0;
    
    // Clear break bars
    breakBars.forEach(bar => {
        scene.remove(bar);
    });
    breakBars = [];
    
    // Hide step explanation
    document.getElementById('step-explanation').style.display = 'none';
    
    // Recreate visualization
    createVisualization();
}

// Play the animation
function playAnimation() {
    if (!animationPlaying) {
        animationPlaying = true;
        
        // Update the spinner/pause indicator state
        const explanationElement = document.getElementById('step-explanation');
        if (explanationElement.style.display !== 'none') {
            const spinner = explanationElement.querySelector('.spinner');
            const pauseIndicator = explanationElement.querySelector('.pause-indicator');
            const checkmark = explanationElement.querySelector('.checkmark');
            
            if (spinner && pauseIndicator && checkmark && checkmark.style.display !== 'block') {
                spinner.style.display = 'block';
                pauseIndicator.style.display = 'none';
            }
        }
        
        playNextStep();
    }
}

// Pause the animation
function pauseAnimation() {
    animationPlaying = false;
    
    // Update the spinner/pause indicator state
    const explanationElement = document.getElementById('step-explanation');
    if (explanationElement.style.display !== 'none') {
        const spinner = explanationElement.querySelector('.spinner');
        const pauseIndicator = explanationElement.querySelector('.pause-indicator');
        const checkmark = explanationElement.querySelector('.checkmark');
        
        if (spinner && pauseIndicator && checkmark && checkmark.style.display !== 'block') {
            spinner.style.display = 'none';
            pauseIndicator.style.display = 'block';
        }
    }
    
    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

// Play the next step in the animation
function playNextStep() {
    if (currentStep < calculationSteps.length) {
        // Execute the current step
        calculationSteps[currentStep].action();
        
        // Move to the next step
        currentStep++;
        
        // Schedule the next step if animation is still playing
        if (animationPlaying) {
            animationId = setTimeout(playNextStep, 3000 / animationSpeed);
        }
    } else {
        // Animation complete
        animationPlaying = false;
    }
}

// Handle window resize
function onWindowResize() {
    camera.aspect = document.getElementById('visualization').clientWidth / document.getElementById('visualization').clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(document.getElementById('visualization').clientWidth, document.getElementById('visualization').clientHeight);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// Initialize the visualization when the page loads
window.addEventListener('load', init);

// Helper functions for the visualization steps

// Highlight the shift to indicate it's being measured
function highlightShift() {
    // Create a temporary highlight effect for the shift bar
    if (shiftBar) {
        const originalMaterial = shiftBar.material.clone();
        const highlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
        
        // Apply highlight material
        shiftBar.material = highlightMaterial;
        
        // Animate the highlight effect
        setTimeout(() => {
            // Fade back to original material
            shiftBar.material = originalMaterial;
        }, 1000);
    }
}

// Add break placeholders without positioning them yet
function addBreakPlaceholders() {
    const shiftMesh = scene.children.find(child => child.userData.type === 'shift');
    if (!shiftMesh) return;
    
    const shiftStart = shiftMesh.position.x - shiftMesh.geometry.parameters.width / 2;
    const shiftWidth = shiftMesh.geometry.parameters.width;
    
    // Get break configuration from UI
    const breakCount = parseInt(document.getElementById('break-count').value) || 1;
    const breakDuration = parseInt(document.getElementById('break-duration').value) || 30;
    
    // Calculate break width based on duration and shift scale
    const breakWidth = (breakDuration / 60) * (shiftWidth / (shiftDuration / 60));
    
    // Create break placeholders at the center of the shift (will be positioned later)
    const shiftCenter = shiftStart + shiftWidth / 2;
    
    for (let i = 0; i < breakCount; i++) {
        // Create a break mesh with a different color to indicate it's a placeholder
        const breakGeometry = new THREE.BoxGeometry(breakWidth, 0.5, 0.5);
        const breakMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xe74c3c, // Red color for placeholders
            transparent: true, 
            opacity: 0.5 
        });
        
        const breakBar = new THREE.Mesh(breakGeometry, breakMaterial);
        breakBar.position.set(shiftCenter, 0, 0.3);
        breakBar.userData = {
            type: 'break',
            index: i,
            duration: breakDuration,
            positioned: false
        };
        
        scene.add(breakBar);
    }
    
    // Update the scene
    renderer.render(scene, camera);
}

// Position the breaks within the shift based on distribution type
function positionBreaks() {
    const shiftMesh = scene.children.find(child => child.userData.type === 'shift');
    if (!shiftMesh) return;
    
    const shiftStart = shiftMesh.position.x - shiftMesh.geometry.parameters.width / 2;
    const shiftWidth = shiftMesh.geometry.parameters.width;
    
    // Get distribution type from UI
    const distributionType = document.getElementById('distribution-type').value;
    
    // Get all break meshes
    const breakMeshes = scene.children.filter(child => 
        child.userData.type === 'break' && !child.userData.positioned
    );
    
    if (breakMeshes.length === 0) return;
    
    // Calculate positions based on distribution type
    const breakCount = breakMeshes.length;
    
    breakMeshes.forEach((breakMesh, index) => {
        let breakPosition;
        
        switch (distributionType) {
            case 'EVEN':
                // Distribute breaks evenly across the shift
                const segment = shiftWidth / (breakCount + 1);
                breakPosition = shiftStart + segment * (index + 1);
                break;
                
            case 'START':
                // Position breaks at the start of the shift
                const startSegment = shiftWidth / 4;
                breakPosition = shiftStart + startSegment * (index + 1) / (breakCount + 1);
                break;
                
            case 'MIDDLE':
                // Position breaks in the middle of the shift
                const middleStart = shiftStart + shiftWidth / 4;
                const middleWidth = shiftWidth / 2;
                const middleSegment = middleWidth / (breakCount + 1);
                breakPosition = middleStart + middleSegment * (index + 1);
                break;
                
            case 'END':
                // Position breaks at the end of the shift
                const endStart = shiftStart + shiftWidth * 3 / 4;
                const endWidth = shiftWidth / 4;
                const endSegment = endWidth / (breakCount + 1);
                breakPosition = endStart + endSegment * (index + 1);
                break;
                
            default:
                // Default to even distribution
                const defaultSegment = shiftWidth / (breakCount + 1);
                breakPosition = shiftStart + defaultSegment * (index + 1);
        }
        
        // Update break position
        breakMesh.position.x = breakPosition;
        breakMesh.userData.positioned = true;
        
        // Change color to indicate it's been positioned
        breakMesh.material.color.set(0xf39c12); // Orange color
    });
    
    // Update the scene
    renderer.render(scene, camera);
}

// Adjust break positions to maintain minimum distance between breaks
function adjustBreaksForMinimumDistance() {
    const shiftMesh = scene.children.find(child => child.userData.type === 'shift');
    if (!shiftMesh) return;
    
    const shiftStart = shiftMesh.position.x - shiftMesh.geometry.parameters.width / 2;
    const shiftWidth = shiftMesh.geometry.parameters.width;
    
    // Get minimum distance from UI (in minutes)
    const minDistanceMinutes = parseInt(document.getElementById('min-distance').value) || 30;
    
    // Convert to scene units
    const minDistance = (minDistanceMinutes / 60) * (shiftWidth / (shiftDuration / 60));
    
    // Get all positioned break meshes
    const breakMeshes = scene.children.filter(child => 
        child.userData.type === 'break' && child.userData.positioned
    ).sort((a, b) => a.position.x - b.position.x); // Sort by position
    
    if (breakMeshes.length <= 1) return;
    
    // Check and adjust distances
    for (let i = 1; i < breakMeshes.length; i++) {
        const prevBreak = breakMeshes[i - 1];
        const currentBreak = breakMeshes[i];
        
        const prevBreakEnd = prevBreak.position.x + prevBreak.geometry.parameters.width / 2;
        const currentBreakStart = currentBreak.position.x - currentBreak.geometry.parameters.width / 2;
        
        const currentDistance = currentBreakStart - prevBreakEnd;
        
        if (currentDistance < minDistance) {
            // Need to adjust
            const adjustment = minDistance - currentDistance;
            
            // Move current break to the right
            currentBreak.position.x += adjustment;
            
            // Change color to indicate adjustment
            currentBreak.material.color.set(0x9b59b6); // Purple color
        }
    }
    
    // Update the scene
    renderer.render(scene, camera);
}

// Finalize the breaks by changing their color to the final state
function finalizeBreaks() {
    // Get all break meshes
    const breakMeshes = scene.children.filter(child => child.userData.type === 'break');
    
    breakMeshes.forEach(breakMesh => {
        // Change to final color
        breakMesh.material.color.set(0x2ecc71); // Green color
        breakMesh.material.opacity = 0.9;
    });
    
    // Update the scene
    renderer.render(scene, camera);
}

// Main function to update the visualization
function updateVisualization() {
    // Validate shift length and weekday
    const isShiftLengthValid = validateShiftLength();
    const isWeekdayValid = validateWeekday();
    
    // Only proceed if both validations pass
    if (!isShiftLengthValid || !isWeekdayValid) {
        // Clear existing break bars
        breakBars.forEach(bar => {
            scene.remove(bar);
        });
        breakBars = [];
        
        // Update the timeline and shift bar
        createTimeline();
        createShiftBar();
        
        // Update camera to frame the entire timeline
        updateCamera();
        
        return;
    }
    
    // Create visualization
    createVisualization();
    
    // Reset animation state
    currentStep = 0;
    isAnimating = false;
    
    // Update animation controls
    document.getElementById('play-animation-btn').disabled = false;
    document.getElementById('pause-animation-btn').disabled = true;
    document.getElementById('animation-step').textContent = '0';
    document.getElementById('animation-total-steps').textContent = calculationSteps.length;
    
    // Update explanation text
    document.getElementById('explanation-text').innerHTML = 'Click "Play Animation" to start the break calculation animation.';
}

// Generate breaks based on the break rule
function generateBreaks() {
    // Clear previous breaks
    resetBreaks();
    
    const shiftStart = new Date(config.shift.start);
    const shiftEnd = new Date(config.shift.end);
    const shiftLengthInMinutes = (shiftEnd - shiftStart) / (60 * 1000);
    const breakRuleHoursInMinutes = hoursToMinutes(config.breakRule.hours);
    
    // Validate shift length
    const isValid = validateShiftLength();
    
    // Check if shift is long enough for breaks
    if (!isValid) {
        // Return early - don't generate breaks for invalid shift length
        return [];
    }
    
    // Generate calculation steps
    calculationSteps = generateCalculationSteps();
    
    // If no applicable break rules, return empty array
    if (calculationSteps.length === 0 || !calculationSteps[calculationSteps.length - 1].breaks) {
        return [];
    }
    
    // Return the final breaks
    return calculationSteps[calculationSteps.length - 1].breaks;
}

// Update the camera to frame the entire timeline
function updateCamera() {
    // Get the shift start and end times
    const shiftStart = new Date(config.shift.start);
    const shiftEnd = new Date(config.shift.end);
    
    // Calculate the shift duration in hours
    const shiftDuration = (shiftEnd - shiftStart) / (60 * 60 * 1000);
    
    // Add padding to ensure we see a bit before and after the shift
    const paddingHours = 1;
    const totalWidth = shiftDuration + (paddingHours * 2);
    
    // Calculate the required camera Z position based on the field of view and timeline width
    const fov = camera.fov * (Math.PI / 180); // Convert FOV to radians
    const aspectRatio = document.getElementById('visualization').clientWidth / document.getElementById('visualization').clientHeight;
    
    // Calculate the distance needed to see the entire timeline width
    // Using the formula: distance = (width/2) / tan(fov/2)
    const requiredZ = (totalWidth * 2) / (2 * Math.tan(fov / 2)) * 1.2; // Add 20% extra space
    
    // Set the camera position
    camera.position.z = Math.max(requiredZ, 25); // Ensure minimum zoom level
    
    // Center the camera on the timeline
    const timelineCenter = (timeToPosition(shiftStart) + timeToPosition(shiftEnd)) / 2;
    camera.position.x = timelineCenter;
    
    // Update the controls target to match the camera position
    controls.target.set(timelineCenter, 0, 0);
    controls.update();
}

// Get applicable break rules based on weekday and shift length
function getApplicableBreakRules() {
    const shiftStart = new Date(config.shift.start);
    const shiftEnd = new Date(config.shift.end);
    const shiftLengthInMinutes = (shiftEnd - shiftStart) / (60 * 1000);
    const breakRuleHoursInMinutes = hoursToMinutes(config.breakRule.hours);
    const selectedWeekday = parseInt(config.breakRule.weekday);
    
    // Create a dummy break rule for demonstration
    const breakRule = {
        id: 1,
        hours: config.breakRule.hours,
        minutes: config.breakRule.minutes,
        numberOfBreaks: config.breakRule.numberOfBreaks,
        distributeType: config.breakRule.distributeType,
        afterHours: config.breakRule.afterHours,
        weekday: selectedWeekday
    };
    
    // Check if the rule is applicable based on weekday and shift length
    const shiftWeekday = shiftStart.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Weekday match logic: either the rule applies to any day (-1) or it matches the shift weekday
    const weekdayMatch = breakRule.weekday === -1 || breakRule.weekday === shiftWeekday;
    
    // Hours match logic: shift length must be at least the minimum required by the break rule
    const hoursMatch = shiftLengthInMinutes >= breakRuleHoursInMinutes;
    
    // Rule is applicable if both weekday and hours match
    const isApplicable = weekdayMatch && hoursMatch;
    
    // Return applicable break rules
    return isApplicable ? [breakRule] : [];
}
