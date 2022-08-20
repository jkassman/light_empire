var g_frames_per_second = 60;

const init_pixels_per_inch = 80;
var g_pixels_per_nanometer = init_pixels_per_inch * 25400 // oops this is not well named...
var g_unit_label = "in" // TODO: Commonize this; e.g. set number of labels, and determine
                    // g_nanometers_per_unit from the label
var g_nanometers_per_unit = 25400;

var g_lines = [];
var g_hover_point = null;

var c = document.getElementById("mainCanvas2")
var ctx = c.getContext('2d');
var base

function deepCopy(item){
    return JSON.parse(JSON.stringify(item))
}

// I kinda doubt this is going to just work...but let's try'
function fixupElement(element, width_percent, height_percent='100%'){
    //get DPI
    let dpi = window.devicePixelRatio;

    /* Set style to percent based */
    element.style.width = width_percent
    element.style.height = height_percent

    /* Calculate raw pixels based on style and percent */

    //get CSS height
    //the + prefix casts it to an integer
    //the slice method gets rid of "px"
    let style_height = +getComputedStyle(element).getPropertyValue("height").slice(0, -2);
    //get CSS width
    let style_width = +getComputedStyle(element).getPropertyValue("width").slice(0, -2);
    //scale the canvas
    element.setAttribute('height', Math.floor(style_height * dpi));
    element.setAttribute('width', Math.floor(style_width * dpi));
}

function clear_canvas(){
    ctx.clearRect(0, 0 , c.width, c.height)
    fixupElement(c, '100%', '96%')
}


g_x_axis_pixel_offset = 0
g_y_axis_pixel_offset = 0
function draw_axes(){
    ctx.save();
    var axis_width = 5
    ctx.lineWidth = axis_width;

    // X Axis
    ctx.beginPath();
    ctx.moveTo(0, axis_width/2);
    ctx.lineTo(c.width,axis_width/2);
    ctx.stroke();

    // Y Axis
    ctx.beginPath();
    ctx.moveTo(axis_width/2, 0);
    ctx.lineTo(axis_width/2, c.height);
    ctx.stroke();

    var notch_width = 3;
    var pixels_per_notch = 1 / g_nanometers_per_unit * g_pixels_per_nanometer;
    var notch_color = "black"
    var grid_color = "grey"
    var grid_width = 1;

    // X notches
    var notch_length = 10;

    //console.log(pixels_per_notch)
    var init_x = g_x_axis_pixel_offset % pixels_per_notch
    //console.log(init_x)
    for (var i = init_x; i < c.width; i += pixels_per_notch){
        ctx.strokeStyle = grid_color;
        ctx.lineWidth = grid_width;
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, c.height);
        ctx.stroke();

        ctx.strokeStyle = notch_color;
        ctx.lineWidth = notch_width;
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 10);
        ctx.stroke();
    }

    // Y notches
    var init_y = g_y_axis_pixel_offset % pixels_per_notch
    for (var i = init_y; i < c.height; i += pixels_per_notch){
        ctx.strokeStyle = grid_color;
        ctx.lineWidth = grid_width;
        ctx.beginPath();
        
        ctx.moveTo(0, i);
        ctx.lineTo(c.width, i);
        ctx.stroke();

        ctx.strokeStyle = notch_color;
        ctx.lineWidth = notch_width;
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(10, i);
        ctx.stroke();
    }

    ctx.restore();
}

function draw_lines(){
    for (var i = 0; i < g_lines.length; i++){
        g_lines[i].draw();
    }
}

function lazy_equals(thing1, thing2){
    sanity_check(thing1)
    sanity_check(thing2)
    // Ideally, we'd use EPSILON as the tolerance:
    // var tolerance = Number.EPSILON
    // But illustrator svg export only goes to seven decimals
    // Consider...parsing eps? making the units for the decimals smaller?
    // or just not caring about microns and being fine with this tolerance

    if (typeof(thing1) === "string" || typeof(thing2) === "string"){
        to_return = (thing1 === thing2)
        if (!to_return){
            //console.log("Strings are not equal: " + thing1 + ", " + thing2)
        } else{
            //console.log("Strings are equal: " + thing1 + ", " + thing2)
        }
        return to_return;
    }

    var tolerance = 0.000001 
    return (Math.abs(thing1 - thing2) < tolerance)
}

function sanity_check(insane_value){
    if (!insane_value && (insane_value != 0) && (insane_value != "")){
        throw "Insane value! " + insane_value
    }
}

class Point {
    update(x, y, angle){
        this.realX = x / g_pixels_per_nanometer
        this.realY = y / g_pixels_per_nanometer
        this.angle = angle;
    }

    constructor(x, y){
        sanity_check(x)
        sanity_check(y)
        this.point_size = 5;
        this.update(x, y);
        this.offsetX = 0;
        this.offsetY = 0;
        this.angle = null;
    }

    copy(){
        to_return = new Point(0, 0)
        to_return.realX = this.realX;
        to_return.realY = this.realY;
        to_return.offsetX = this.offsetX;
        to_return.offsetY = this.offsetY;
        return to_return
    }

    pixelX(){
        return (this.realX + this.offsetX) * g_pixels_per_nanometer
    }

    pixelY(){
        return (this.realY + this.offsetY) * g_pixels_per_nanometer
    }

    unitX(){
        return (this.realX + this.offsetX) * g_nanometers_per_unit;
    }

    unitY(){
        return (this.realY + this.offsetY) * g_nanometers_per_unit;
    }

    toString(){
        return "(" + this.unitX().toFixed(6) + ", " + this.unitY().toFixed(6) + ")" 
    }

    draw(){
        ctx.save();
        
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.rect(this.pixelX() - (this.point_size/2), this.pixelY() - (this.point_size / 2),
                                  this.point_size, this.point_size);
        ctx.fill();

        ctx.restore();
    }

    select(){
        this.color = "purple"
    }
    deselect(){
        this.color = "black"
    }

    offset(offsetX, offsetY){
        this.offsetX += (offsetX / g_pixels_per_nanometer);
        this.offsetY += (offsetY / g_pixels_per_nanometer);
    }

    distance(x, y){
        var a = this.pixelX() - x;
        var b = this.pixelY() - y;

        return Math.sqrt( a*a + b*b );
    }

    realDistance(other_point){
        var a = (this.realX + this.offsetX) - (other_point.realX + other_point.offsetX)
        var b = (this.realY + this.offsetY) - (other_point.realY + other_point.offsetY)

        //console.log(this.offsetX)
        //console.log(this.realX)
        //console.log(other_point.realX)
        return Math.sqrt(a*a + b*b)
    }

    near(x, y){
        var near_radius = 8 // TOCONSIDER: Take this as a parameter (or global config?)
        //console.log(this.distance(x, y))
        if (this.distance(x, y) <= near_radius){
            return true
        }
        return false
    }

    equals(other){
        return (lazy_equals(this.realX + this.offsetX, other.realX + other.offsetX) && lazy_equals(this.realY + this.offsetY, other.realY + other.offsetY))
        /*
        var diffX = Math.abs(this.realX - other.realX)
        var diffY = Math.abs(this.realY - other.realY)
        console.log(diffX)
        console.log(diffY)
        //return (diffX < .1) && (diffY < .1)
        return ((diffX < Number.EPSILON) && (diffY < Number.EPSILON))
        */
    }
}

class Line {
    constructor(startX, startY, endX=null, endY=null){
        // lazy overloading to allow taking two points
        // assume some object is a point
        if (typeof(startX) === "object"){
            this.startPoint = startX
            if (startY){
                this.endPoint = startY
                this.finished = false
            }
            else {
                this.endPoint = startPoint.copy()
                this.finished = false;
            }
        } else {
            this.startPoint = new Point(startX, startY)
            if ((endX === null) || (endY === null)){
                this.endPoint = new Point(startX, startY)
                this.finished = false
            } else {
                this.finished = true;
                this.endPoint = new Point(endX, endY);
            }
        }
    }

    draw(){
        this.startPoint.draw();

        ctx.beginPath();
        ctx.moveTo(this.startPoint.pixelX(), this.startPoint.pixelY());
        ctx.lineTo(this.endPoint.pixelX(), this.endPoint.pixelY());
        ctx.stroke();

        if (this.finished){
            this.endPoint.draw();
        }
    }

    realLength(){
        return this.startPoint.realDistance(this.endPoint)
    }

    is_point_on(point){
        var separate_point_distance = this.startPoint.realDistance(point) + this.endPoint.realDistance(point)
        return lazy_equals(separate_point_distance, this.realLength())
        // https://stackoverflow.com/questions/17692922/check-is-a-point-x-y-is-between-two-points-drawn-on-a-straight-line
        // nifty; can just check distances

        // Formula
    }

    slope(){
        if (lazy_equals(0, this.endPoint.realX - this.startPoint.realX)){
            return "vertical" // TOCONSIDER
        }
        to_return = (this.endPoint.realY - this.startPoint.realY) / (this.endPoint.realX - this.startPoint.realX)
        if (!to_return && to_return != 0){
            console.log("Slope returning bad value for some reason!")
            console.log(this.startPoint)
            console.log(this.endPoint)
        }
        return to_return
    }

    to_svg(){
        var x1 = this.startPoint.unitX() //+ g_unit_label
        var y1 = this.startPoint.unitY() //+ g_unit_label
        var x2 = this.endPoint.unitX() //+ g_unit_label
        var y2 = this.endPoint.unitY() //+ g_unit_label
        return '<line '
                    + 'x1="' + x1 + '" '
                    + 'y1="' + y1 + '" '
                    + 'x2="' + x2 + '" '
                    + 'y2="' + y2 + '" '
                    + 'style="stroke: blue; stroke-width: 0.008;"/>'
    }

    update_end_position(x, y){
        this.endPoint.update(x, y);
    }

    finish(x, y){
        this.finished = true;
        this.endPoint.update(x, y);
    }

    offset(offsetX, offsetY){
        this.startPoint.offset(offsetX, offsetY);
        if (this.finished){
            this.endPoint.offset(offsetX, offsetY);
        }
    }

    get_point_near(x, y){
        if (this.startPoint.near(x,y)){
            return this.startPoint
        }
        else if (this.endPoint.near(x,y)){
            return this.endPoint
        }
        else{
            return null
        }
    }
}

// This is ballooning out of control...
// Some Vector stuff from https://evanw.github.io/lightgl.js/docs/vector.html
class Vector{
    constructor(point_or_x, y, z){
        if (point_or_x instanceof Point){
            this.x = point_or_x.unitX();
            this.y = point_or_x.unitY();
            this.z = 0;
        } else {
            this.x = point_or_x;
            this.y = y;
            this.z = z;
        }
    }

    dot(v) {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }

    length() {
        return Math.sqrt(this.dot(this));
    }

    add(v) {
        if (v instanceof Vector) return new Vector(this.x + v.x, this.y + v.y, this.z + v.z);
        else return new Vector(this.x + v, this.y + v, this.z + v);
    }
    subtract(v) {
        if (v instanceof Vector) return new Vector(this.x - v.x, this.y - v.y, this.z - v.z);
        else return new Vector(this.x - v, this.y - v, this.z - v);
    }
    multiply(v) {
        if (v instanceof Vector) return new Vector(this.x * v.x, this.y * v.y, this.z * v.z);
        else return new Vector(this.x * v, this.y * v, this.z * v);
    }
    divide(v) {
        if (v instanceof Vector) return new Vector(this.x / v.x, this.y / v.y, this.z / v.z);
        else return new Vector(this.x / v, this.y / v, this.z / v);
    }

    unit() {
        return this.divide(this.length());
    }
}

function find_angle(A,B,C) {
    var AB = Math.sqrt(Math.pow(B.x-A.x,2)+ Math.pow(B.y-A.y,2));    
    var BC = Math.sqrt(Math.pow(B.x-C.x,2)+ Math.pow(B.y-C.y,2)); 
    var AC = Math.sqrt(Math.pow(C.x-A.x,2)+ Math.pow(C.y-A.y,2));
    return Math.acos((BC*BC+AB*AB-AC*AC)/(2*BC*AB));
}

class Path{
    constructor(startX, startY){
        this.points = [new Point(startX, startY)]
        this.types = ["move"]
        this.finished = false
        this.closed = false;
    }

    to_lines(){
        var all_lines = []
        for (var i = 0; i < this.points.length - 1; i++){
            all_lines.push(new Line(this.points[i], this.points[i+1]))
        }
        return all_lines
    }

    // Overall thought...rather than messing with ctx, maybe just create an svg and display it?
    // Eh...ctx allows for fancier stuff (drawing points, guidepoints, coloring things purple)
    draw(){
        // Draw all points, except the last one if unfinished
        var points_to_draw = this.points.length;
        if (!this.finished){
            points_to_draw -= 1
        }
        for (var i = 0; i < points_to_draw; i++){
            this.points[i].draw();
        }
        // Draw the lines in between the points
        ctx.beginPath();
        ctx.moveTo(this.points[0].pixelX(), this.points[0].pixelY());
        for (var i = 1; i < this.points.length; i++){
            if (this.types[i] === "move"){
                ctx.moveTo(this.points[i].pixelX(), this.points[i].pixelY())
            } else if (this.types[i] === "lineTo"){
                ctx.lineTo(this.points[i].pixelX(), this.points[i].pixelY());
            } else {
                console.log("Unrecognized type '" + this.types[i] + "'!")
            }
        }
        ctx.stroke();
    }

    svg_d(){
        var svg_str = 'M ' + this.points[0].unitX() //+ g_unit_label
        svg_str += ' ' +  this.points[0].unitY() //+ g_unit_label
        var points_to_loop_thru = this.points.length;
        if (this.closed){
            points_to_loop_thru -= 1
        }
        for (var i = 1; i < points_to_loop_thru; i++){
            if (this.types[i] === "move"){
                svg_str += ' M'
            } else if (this.types[i] === "lineTo"){
                svg_str += ' L'
            } else {
                console.log("Unrecognized type '" + this.types[i] + "'!")
            }
            svg_str += ' ' + this.points[i].unitX() //+ g_unit_label
            svg_str += ' ' + this.points[i].unitY() //+ g_unit_label
        }
        if (this.closed){
            svg_str += ' Z';
        }
        return svg_str
    }

    outlined_points(offset){
        if (!this.closed){
            return null
        }
        var outlined_points = [];
        for (var i = 0; i < this.points.length - 1; i++){
            var p = new Vector(this.points[i]);
            var prev = i - 1
            if (i == 0){
                prev = this.points.length-2;
            }
            var prevPoint = new Vector(this.points[prev]);
            var next = i + 1;
            if (i == (this.points.length - 2)){
                next = 0
            }
            var nextPoint = new Vector(this.points[next]);
            
            /*
            console.log(prevPoint);
            console.log(p);
            console.log(nextPoint);
            */

            /* Code borrowed from https://stackoverflow.com/questions/56477372/calculate-interior-bisectors-in-closed-polygon */
            let v1 = p.subtract(prevPoint).unit();
            let v2 = nextPoint.subtract(p).unit();
            //let v1 = normalizeVector({ x: p.x - prevPoint.x, y : p.y - prevPoint.y });
            //let v2 = normalizeVector({ x: nextPoint.x - p.x, y : nextPoint.y - p.y });

            var k = v1.x * v2.y - v1.y * v2.x;
            /*
            console.log(k)
            console.log(v1);
            console.log(v2);
            */

            if (k < 0){
               //the angle is greater than pi, invert outgoing, 
               //ready to get interior bisector 
               v2 = v2.multiply(-1);  
            }
            else{
               //the angle is less than pi, invert incoming, 
               v1 = v1.multiply(-1);
            }
            

            //bisector = normalizeVector({ x: v1.x + v2.x, y : v1.y + v2.y });
            var bisector = v1.add(v2).unit()
            //var to_push = p + multiply(bisector, offset);
            var adjusted_offset = offset / Math.sin(find_angle(prevPoint, p, nextPoint)/2)
            console.log(offset);
            console.log(adjusted_offset);
            var to_push = p.add(bisector.multiply(adjusted_offset));
            //console.log(to_push);
            outlined_points.push(to_push) //p + (bisector * offset));
        }
        console.log(outlined_points)
        return outlined_points;
    }



    outlined_svg_d(offset){
        var outlined_points = this.outlined_points(offset);
        if (outlined_points == null){
            return this.svg_d();
        }
        var svg_str = ''
        for (var i = 0; i < outlined_points.length; i++){
            if (i == 0){
                svg_str += 'M';
            } else {
                svg_str += 'L';
            }
            svg_str += ' ' + outlined_points[i].x
            svg_str += ' ' + outlined_points[i].y
        } 
        svg_str += 'Z';
        return svg_str
        /*
        var spo = require('svg-path-outline');
        var options = new Object();
        if (offset < 0){
            options.inside = true;
            options.outside = false;
            offset *= -1;
        }
        //options.bezierAccuracy = 0; // TODO: Probably change this if we ever do beziers
        options.joints = 1;
        var outline = spo(this.svg_d(), offset, options);
        return outline;
        */
    }

    wrap_svg_d(svg_d, color, width){
        var svg_str = '<path d="' + svg_d;
        svg_str += '" style="stroke: ' + color + '; fill: none; stroke-width: ' + width +';"/>\n'
        return svg_str
    }

    to_svg(color, width){
        return this.wrap_svg_d(this.svg_d(), color, width)
    }

    outlined_svg(offset, color, width){
        return this.wrap_svg_d(this.outlined_svg_d(offset), color, width);
    }

    to_outlined_svg(){
        var svg_str = this.to_svg('#000', '0.0005');
        svg_str += this.outlined_svg(.003, '#00F', '0.008');
        svg_str += this.outlined_svg(.003, '#F0F', '0.0005');
        svg_str += this.outlined_svg(-.001, '#0F0', '0.0005');
        svg_str += this.outlined_svg(-.004, '#F0F', '0.0005');
        return svg_str
    }

    add_point(x, y){
        this.points.push(new Point(x, y));
        this.finished = false;
        this.types.push("lineTo")
    }

    move_to(x, y){
        this.points.push(new Point(x, y));
        this.finished = false;
        this.types.push("move")
    }

    update_end_position(x, y){
        //console.log(x + "," + y)
        this.points[this.points.length - 1].update(x, y);
    }

    finish(x, y, angle, modify_last_point=true){
        console.log("x: " + x + ", y: " + y + ", angle: " + angle)
        if (!modify_last_point){
            this.add_point(0,0)
        }
        this.finished = true;
        var last_point = this.points[this.points.length - 1]
        var prev_point = this.points[this.points.length - 2] // 2nd to last
        if (prev_point && (prev_point.angle != null) && (prev_point.angle == angle)){
            // Update prev_point to be last_point
            prev_point.update(x, y, angle);
            this.points.pop();
            last_point = prev_point;
        } else {
            last_point.update(x, y, angle);
        }

        // TODO: this logic probably needs some closer looks
        // If not closed, and hover point is the start point, close the loop
        if ((!this.closed) && last_point.equals(this.points[0])){ //(g_hover_point == this.points[0])){
            // I think we need to define point equality?
            this.closed = true;
            console.log("CLOSED!!")
            // Should break out of shift mode here
        }
        return this.closed
    }

    mark_finished(){
        // TOCONSIDER
        this.finished = true
    }

    close_path(){
        // TOCONSIDER
        this.add_point(this.points[0].copy()) //this.points[0].pixelX(), this.points[0].pixelY())
        this.closed = true;
        this.finished = true;
    }

    offset(offsetX, offsetY){
        for (var i = 0; i < this.points.length; i++){
            this.points[i].offset(offsetX, offsetY)
        }
    }

    get_point_near(x, y){
        for (var i = 0; i < this.points.length; i++){
            if (this.points[i].near(x, y)){
                return this.points[i];
            }
        }
        return null;
    }
}

g_prior_location = null;

// modifies path in place and returns it
function process_path_cmd(mode, state, args, path){
    if (mode === null){
        return path;
    }
    //args *= 100
    //console.log("mode: " + mode + " state: " + state + " args: " + String(args))
    var baseX = 0
    var baseY = 0
    var mode_lower = mode.toLowerCase()
    if (mode === mode_lower){
        baseX = g_prior_location[0]
        baseY = g_prior_location[1]
    }
    var modX = 0
    var modY = 0
    var modify_path = true
    if (mode_lower === "m"){
        modX = args[0]
        modY = args[1]
        modify_path = false
    } else if (mode_lower === "z"){
        path.close_path()
        modify_path = false
    } else if (mode_lower === "h"){
        modX = args[0]
        modY = 0
        baseY = g_prior_location[1]
    } else if (mode_lower === "v"){
        modX = 0
        baseX = g_prior_location[0]
        modY = args[0]
    } else if (mode_lower == "l"){
        modX = args[0]
        modY = args[1]
    } else if (mode_lower === "c"){
        // Ignore the complicated bits for now
        modX = args[4]
        modY = args[5]
    } else if (mode_lower === "s"){
        // Ignore the complicated bits for now; this is reliant on past curves
        modX = args[2]
        modY = args[3]
    } else {
        console.log("Unrecognized mode " + mode + "!")
    }

    var x = baseX + modX
    var y = baseY + modY

    if (modify_path){
        if (path === null){
            path = new Path(g_prior_location[0], g_prior_location[1])
        }
        path.add_point(x, y);
    }
    g_prior_location = [x, y]
    
    return path;
}

function add_d_to_screen(d_text){
    var new_path = null;
    var mode = null
    var state = 0
    var prior_number = false
    var current_number= ""
    var args = []

    for (var i = 0; i < d_text.length; i++){
        var char = d_text[i]
        if (["m", "h", "v", "c", "s", "l", "z"].includes(char.toLowerCase())){
            if (prior_number){ // TODO: DEDUPE/REORG
                state++;
                args.push(parseFloat(current_number))
                current_number = ""
            }
            new_path = process_path_cmd(mode, state, args, new_path)
            if (mode == "z"){
                new_path.mark_finished()
                g_lines.push(new_path)
                new_path = null;
            }
            // Process prior mode
            args = []
            mode = char;
            state = 0;
            prior_number = false
        } else if ([".", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(char)){
            prior_number = true;
            current_number += char;
        } else if (char === "-"){
            if (prior_number){
                state++;
                args.push(parseFloat(current_number))
            }
            current_number = "-"
            prior_number = true;
        } else {
            if ((char.trim().length === 0) || (char === ",")){
                //pass
            } else {
                console.log("Unrecognized char " + char + "!")
            }
            if (prior_number){
                state++
                args.push(parseFloat(current_number))
                current_number = ""
            }
            prior_number = false;
        }

    }
    if (prior_number){ // TODO: DEDUPE/REORG
    state++;
    args.push(parseFloat(current_number))
    current_number = ""
    }
    new_path = process_path_cmd(mode, state, args, new_path)
    if (new_path != null){
        new_path.mark_finished()
        g_lines.push(new_path)
        //console.log(new_path)
    }
    //var new_path = new path(x, y)
}

function write_screen_to_svg(outlined){
    var width_in_units = (c.width / g_pixels_per_nanometer) * g_nanometers_per_unit
    var height_in_units = (c.height / g_pixels_per_nanometer) * g_nanometers_per_unit
    
    svg_file = '<?xml version="1.0" standalone="no"?>\n'
    svg_file += '<!DOCTYPE svg>\n'
    svg_file += '<svg width="' + width_in_units + g_unit_label + '" '
        + 'height="' + height_in_units + g_unit_label + '" '
        + 'viewBox="0 0 ' + width_in_units + ' ' + height_in_units + '" '
        + 'xmlns="http://www.w3.org/2000/svg" version="1.1">\n'
    for (var i = 0; i < g_lines.length; i++){
        if (outlined){
            svg_file +=  g_lines[i].to_outlined_svg();
        } else {
            svg_file += g_lines[i].to_svg("red", "0.008");
        }
    }
    svg_file += '</svg>\n'
    return svg_file;
}

function get_all_lines(){
    var all_lines = []
    for (var i = 0; i < g_lines.length; i++){
        all_lines = all_lines.concat(g_lines[i].to_lines())
    }
    return all_lines
}

function cleanup_paths(){
    // remove any duplicate points
    for (var i = 0; i < g_lines.length; i++){
        var path = g_lines[i]
        for (var j = 1; j < path.points.length; j++){
            var prev_point = path.points[j-1]
            var curr_point = path.points[j]
            if (curr_point.equals(prev_point)){
                path.points.splice(j, 1)
                path.types.splice(j, 1)
                j--;
            }
        }
    }

    // Remove any exactly overlapping lines
    for (var i = 0; i < g_lines.length; i++){
        var path = g_lines[i]
        for (var j = 1; j < path.points.length; j++){
            if (path.types[j] === "move"){
                continue;
            }
            var prev_point = path.points[j-1]
            var curr_point = path.points[j]
            var all_lines = get_all_lines()
            var count = 0
            for (var k = 0; k < g_lines.length; k++){
                var other_path = g_lines[k]
                for (var m = 1; m < other_path.points.length; m++){
                    if (other_path.types[m] === "move"){
                        continue
                    }
                    var other_prev_point = other_path.points[m-1]
                    var other_curr_point = other_path.points[m]
                    if (other_prev_point.equals(prev_point)){
                        if (other_curr_point.equals(curr_point)){
                            count++
                        }
                    }
                    else if (other_curr_point.equals(prev_point)){
                        if (other_prev_point.equals(curr_point)){
                            count++
                        }
                    }
                } 
            }
            if (count >= 2){ // will always be one, should always hit itself
                path.types[j] = "move"
                console.log("Removing " + path.points[j].toString())
            }
        }
    }

    // Delete any hanging move commmands
    // This should actually also delete single points
    for (var i = 0; i < g_lines.length; i++){
        var path = g_lines[i]
        for (var j = path.points.length; j >= 0; j--){
            if (j == path.points.length -1 ){
                if (path.types[j] === "move"){
                    path.points.splice(j, 1)
                    path.types.splice(j, 1)
                    if (j === 0){
                        g_lines.splice(i, 1)
                    }
                }
            }
        }
    }
}

function replace_overlapping_lines(){
    // This name is a misnomer; really it just adds points
    for (var i = 0; i < g_lines.length; i++){
        var path = g_lines[i]
        for (var j = 0; j < path.points.length - 1; j++){
            var point = path.points[j]
            var next_point = path.points[j+1]
            var line = new Line(point, next_point)
            var all_lines = get_all_lines();
            //console.log(all_lines)
            for (var k = 0; k < all_lines.length; k++){
                var other_line = all_lines[k]
                //console.log(other_line, point)
                //console.log(other_line.slope())
                //console.log(line.slope())
                if (/*(other_line.is_point_on(point) 
                     || other_line.is_point_on(next_point))
                    && */ lazy_equals(other_line.slope(), line.slope()))
                {
                    //console.log("HERE")
                    for (var p = 0; p < 2; p++){
                        if (p === 0){
                            var other_point = other_line.startPoint;
                        } else {
                            var other_point = other_line.endPoint
                        }
                        if ((!other_point.equals(point) && !other_point.equals(next_point))
                            && line.is_point_on(other_point))
                            {
                                console.log("Adding " + other_point.toString() + " between " + point.toString() + " and " + next_point.toString())
                                path.points.splice(j+1, 0, other_point.copy())
                                path.types.splice(j+1, 0, "lineTo")
                                return true;
                            }
                    }
                    
                }
            }
        }
    }
    console.log("FALSE!")
    return false
}
        /*
                if point.on(line) and angle == other_line.angle:
                    //??
                    for both points in other_line:
                        if point on this.line and not points equal:
                            this.add_point (other_point at the right spot)
                            // That's not really right, we need to split this line, not just add another line
                            // That works, actually
        }
        // For every single line,
        // check every line
        // if you find too lines, take the max?
        // For each line in the 
}
*/
function getCursorPosition(canvas, event) {
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    return [x, y];
    //console.log("x: " + x + " y: " + y)
}

function getLockedMousePosition(c, e){
    xy = getCursorPosition(c, e)
    x = xy[0]
    y = xy[1]
    if (g_line_started || g_selected_path){
        var last_line = g_lines[g_lines.length-1]
        var start_point = null;
        if (g_line_started){
            start_point = last_line.startPoint;
        } else if (g_selected_path){
            start_point = last_line.points[last_line.points.length-2];
        } else{
            throw "Invalid state reached!"
        }
        var current_point = new Point(x, y)
        if (g_lock_angles_tf){
            var startPoint = last_line
            var angleLock = g_lock_angle_degrees
            // Find the radius of the current distance from the home
            if (g_lock_length_tf){
                // TOCONSIDER: Should this be handled elsewhere? like in points?
                var radius = g_lock_length_units * g_pixels_per_nanometer / g_nanometers_per_unit;
            } else {
                var radius = start_point.distance(x,y);
            }
            //console.log(radius);
            // Calculate all points along the circle with that radius
            min_distance = Number.MAX_SAFE_INTEGER
            for (var i = 0; i < 360; i += angleLock){
                var radians = i * Math.PI / 180
                var lockedX = Math.cos(radians) * radius + start_point.pixelX()
                var lockedY = Math.sin(radians) * radius + start_point.pixelY()
                //console.log(i);
                //new Point(lockedX, lockedY).draw()
                var test_distance = current_point.distance(lockedX, lockedY)
                if (test_distance < min_distance){
                    min_distance = test_distance;
                    var minX = lockedX;
                    var minY = lockedY;
                    var minAngle = i;
                }
            }
            if (min_distance === Number.MAX_SAFE_INTEGER){
                console.log("INVALID STATE REACHED; no applicable line found")
                // TODO: Raise/aletr?
            }
            else {
                return [minX, minY, minAngle]
            }get
        }
    }
    return [x, y, null]
}

function checkHoverNear(x, y){
    var near_point_found = false;
    for (var i = 0; i < g_lines.length; i++){
        near_point = g_lines[i].get_point_near(x, y)
        if (near_point != null){
            near_point_found = true;
            //console.log("Nearby!")
            if (g_hover_point){
                g_hover_point.deselect();
            }
            near_point.select();
            g_hover_point = near_point
            break;
        }
    }
    if (!near_point_found){
        if (g_hover_point != null){
            g_hover_point.deselect();
            g_hover_point = null;
        }
    }
}

var g_selected_path = null;
var g_prev_line = null;
c.addEventListener('mousedown', function(e) {
    var xy = getLockedMousePosition(c, e)
    var x = xy[0]
    var y = xy[1]
    var angle = xy[2]

    // NOTE: This can break lock_length_to
    // and probably lock_angles_to
    if (g_hover_point != null){
        x = g_hover_point.pixelX()
        y = g_hover_point.pixelY()
    }
    if (g_line_mode){
        if (!g_line_started){
            g_line_started = true
            g_lines.push(new Line(x, y));
        } else {
            g_lines[g_lines.length-1].finish(x, y);
            if (e.shiftKey){
                g_lines.push(new Line(x, y));
                // g_line_started is already true
            } else{
                g_line_started = false;
            }
            
            g_prev_line = g_lines[g_lines.length-1];
        }
    } else if (g_path_mode){
        if (!g_selected_path){
            g_selected_path = new Path(x, y);
            g_selected_path.add_point(x, y);
            g_lines.push(g_selected_path);
        } else {
            var closed = g_selected_path.finish(x, y, angle);
            if (e.shiftKey && !closed){
                g_selected_path.add_point(x, y)
            } else {
                g_selected_path = null;
            }
        }
    }
    
})

/*
c.addEventListener('mousemove', function(e) {
    xy = getLockedMousePosition(c, e)
    x = xy[0]
    y = xy[1]
    if (g_line_started){
        var last_line = g_lines[g_lines.length-1]
        last_line.update_end_position(x, y)
    }
    checkHoverNear(x, y)
})
*/
g_mouse_x = 0;
g_mouse_y = 0;
c.addEventListener('mousemove', function(e) {
    xy = getLockedMousePosition(c, e)
    g_mouse_x = xy[0]
    g_mouse_y = xy[1]
})

c.addEventListener('wheel',function(event){
    // Handle zoom
    var zoom_modifier = event.deltaY * 1000
    // The idea of the below is we want to zoom in faster and zoom out slower
    zoom_modifier *= g_pixels_per_nanometer/1500000

    // Delete these three:
    //var orig_nano_width = c.width * g_pixels_per_nanometer // = g_pixels_per_nanometer
    //var orig_nano_height = c.height * g_pixels_per_nanometer
    var orig_pixels_per_nanometer = g_pixels_per_nanometer

    var orig_nano_mouse_x = g_mouse_x * g_pixels_per_nanometer
    var orig_nano_mouse_y = g_mouse_y * g_pixels_per_nanometer

    g_pixels_per_nanometer -= zoom_modifier
    
    //var pixels_per_notch = 1 / g_nanometers_per_unit * g_pixels_per_nanometer;
    // below is solving for above where pixels_per_noctch == 1
    if (g_pixels_per_nanometer < g_nanometers_per_unit){
        g_pixels_per_nanometer = g_nanometers_per_unit
    }
    //console.log(g_pixels_per_nanometer) //interesting log

    // delete these 4:
    //var final_nano_width = c.width * g_pixels_per_nanometer
    //var final_nano_height = c.height * g_pixels_per_nanometer
    //var center_move_pixels_x = ((final_nano_width - orig_nano_width) / orig_pixels_per_nanometer)/-2
    //var center_move_pixels_y = ((final_nano_height - orig_nano_height) / orig_pixels_per_nanometer)/-2

    var final_nano_mouse_x = g_mouse_x * g_pixels_per_nanometer //+ center_move_pixels_x
    var final_nano_mouse_y = g_mouse_y * g_pixels_per_nanometer //+ center_move_pixels_y

    // These commented out lines are equivalent
    //var move_pixels_x = (((final_nano_mouse_x - orig_nano_mouse_x) / orig_pixels_per_nanometer) /-1)
    //var move_pixels_y = (((final_nano_mouse_y - orig_nano_mouse_y) / orig_pixels_per_nanometer) /-1)
    var move_pixels_x = -g_mouse_x * ((g_pixels_per_nanometer / orig_pixels_per_nanometer) - 1)
    var move_pixels_y = -g_mouse_y * ((g_pixels_per_nanometer / orig_pixels_per_nanometer) - 1)

    //var move_pixels = (zoom_modifier / 41) * g_nanometers_per_unit / g_pixels_per_nanometer
    for (var i = 0; i < g_lines.length; i++){
        g_lines[i].offset(move_pixels_x, move_pixels_y);
    }

    //(g/orig * n - n)
    //n(g/orig - 1)
    //move_pixels_x = (((final_nano_mouse_x - orig_nano_mouse_x) / g_pixels_per_nanometer) /-1)
    //move_pixels_y = (((final_nano_mouse_y - orig_nano_mouse_y) / g_pixels_per_nanometer) /-1)

    //move_pixels_x *= (orig_pixels_per_nanometer / g_pixels_per_nanometer)
    //move_pixels_y *= (orig_pixels_per_nanometer / g_pixels_per_nanometer)

    move_pixels_x = -g_mouse_x * ((g_pixels_per_nanometer / orig_pixels_per_nanometer) - 1)
    move_pixels_y = -g_mouse_y * ((g_pixels_per_nanometer / orig_pixels_per_nanometer) - 1)

    //g_x_axis_pixel_offset += zoom_modifier;
    //g_y_axis_pixel_offset += zoom_modifier;
    g_x_axis_pixel_offset = g_mouse_x //move_pixels_x
    g_y_axis_pixel_offset = g_mouse_y //move_pixels_y

    return false;
}, false);

document.onkeydown = function(evt) {
    evt = evt || window.event;
    //var charCode = evt.keyCode || evt.which;
    var charCode = evt.charCode || evt.keyCode; // Use either charCode or keyCode, depending on browser support
    var charStr = String.fromCharCode(charCode);

    var pixels_per_move = 20;

    // Inverted offsets since you're moving the camera, not the objects (?)
    // pixels_per_move *= -1

    // up
    var vertical_offset = 0;
    var horizantal_offset = 0;
    if ((charStr === "W") || (charCode === 38)){
        vertical_offset = -pixels_per_move;
    }
    // left
    else if ((charStr === "A") || (charCode === 37)){
        horizantal_offset = -pixels_per_move;
    }
    // down
    else if ((charStr === "S") || (charCode === 40)){
        vertical_offset = pixels_per_move;
    }
    // right
    else if ((charStr === "D") || (charCode === 39)){
        horizantal_offset = pixels_per_move;
    } else if ((charStr === "E")){
        // S for save and D for download are already taken, so...E...for export?
        // Save
        filename = "constraints.svg"; // TODO: make configurable
        download(write_screen_to_svg(), filename, "txt");
    } else if ((charStr === "O")){
        filename = "outlined.svg";
        download(write_screen_to_svg(true), filename, "txt")
    }
    else if ((charStr === "L")){
        if (window.File && window.FileReader && window.FileList && window.Blob) {
            // Read files
        } else {
            alert('The File APIs are not fully supported by your browser.');
        }
    }
    else if ((charStr === "R")){
        // Replace overlapping lines
        var return_value = true;
        var count = 0;
        while (return_value && count < 25){
            count++
            return_value = replace_overlapping_lines()
        }
    }
    else if (charStr === "C"){
        cleanup_paths();
    }
    else if (charCode == 16){
        // do nothing, it's the shift key
    }
    else {
        console.log("Unhandled keyCode " + charCode + "('" + charStr + "') pressed!")
    }

    for (var i = 0; i < g_lines.length; i++){
        g_lines[i].offset(horizantal_offset, vertical_offset);
    }
    g_x_axis_pixel_offset += horizantal_offset;
    g_y_axis_pixel_offset += vertical_offset;
};

// https://stackoverflow.com/questions/13405129/javascript-create-and-save-file
// Function to download data to a file
function download(data, filename, type) {
    var file = new Blob([data], {type: type});
    if (window.navigator.msSaveOrOpenBlob) // IE10+
        window.navigator.msSaveOrOpenBlob(file, filename);
    else { // Others
        var a = document.createElement("a"),
                url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);  
        }, 0); 
    }
}

function selector_is_boolean(selector){
    to_return = (selector.hasAttribute("type") && ((selector.type === "radio") || (selector.type === "checkbox")))
    return to_return
}

function get_html_value(id_list, default_value=null) {
    // Convert to list if it is not
    if( typeof id_list === 'string' ) {
        id_list = [ id_list ];
    }

    for (var i = 0; i < id_list.length; i++){
        selector = document.getElementById(id_list[i])
        if (selector == null){
            throw "Invalid selector id " + id_list[i]
        }
        /*
        if (g_update_from_query_params){
            update_html_value_from_query_params(selector)
        }
        */
        if (selector_is_boolean(selector)) {
            return selector.checked //selector.hasAttribute("checked") 
        } else {
            if (selector.value != ""){
                return selector.value
            }
        }
    }
    return default_value;
}

function update_hover_location(){
    var x = g_mouse_x;
    var y = g_mouse_y;
    if (g_line_started || g_selected_path){
        var last_line = g_lines[g_lines.length-1]
        last_line.update_end_position(x, y)
    }
    checkHoverNear(x, y)
}

var g_lock_angle_degrees = 0;
var g_lock_angles_tf = false;
var g_lock_length_tf = false;
var g_lock_length_units = 0;
function update_from_html(){
    g_lock_length_tf = get_html_value("lock_length_tf");
    g_lock_length_units = parseFloat(get_html_value("lock_length_units"));
    g_lock_angles_tf = get_html_value("lock_angles_tf");
    g_lock_angle_degrees = parseFloat(get_html_value("lock_angle_degrees"));
}
update_from_html(); // Need to run once on load

function get_attr(attr, key){
    return attr.getNamedItem(key).value
}

function get_elements_by_tag_names(x, tag_names) {
    all_items = []
    for (var i = 0; i < tag_names.length; i++){
        all_items = Array.prototype.concat.apply(all_items, x.getElementsByTagName(tag_names[i]));
        //console.log(all_items)
    }
    return all_items;
}

function load_from_svg(){
    var file = document.getElementById('svg_file').files[0];
    var file_reader = new FileReader()
    var unhandled_lines = 0
    file_reader.onloadend = (function() {
        var parser = new DOMParser();
        var parsedSVG = parser.parseFromString(this.result, "image/svg+xml") //"text/xml")

        var elements = parsedSVG.getElementsByTagName("*")
        for (var test = 0; test < elements.length; test++){
            var tagName = elements[test].tagName
            if (!["svg", "xml", "style", "path", "g", "line", "polyline", "polygon"].includes(tagName)){
                console.log("Unrecognized tag name " + tagName + "!")
            }
            //console.log()
        }

        var paths = parsedSVG.getElementsByTagName("path")
        for (var i = 0; i < paths.length; i++){
            var attributes = paths[i].attributes
            for (var j = 0; j < attributes.length; j++){
                var attr = attributes[j];
                if (attr.name === "d"){
                    //console.log(attr)
                    add_d_to_screen(attr.value)
                } else if (attr.name === "class"){
                    // TODO
                } else {
                    console.log("Unrecognized attribute name " + attr.name)
                }
                //console.log(attr.name)
                //console.log(attr.value)
                //console.log(attributes[j].keys())
                //console.log(attributes[j].key)
                //var attr =  paths[i].getAttribute(attributes[j])
                //console.log(attr);
            }
            //console.log(paths[i])
            //console.log(paths[i].attributes)
            if (i >= 10){
                //break;
            }
        }
        var lines = parsedSVG.getElementsByTagName("line")
        for (var i = 0; i < lines.length; i++){
            var attributes = lines[i].attributes
            for (var j = 0; j < attributes.length; j++){
                var attr = attributes[j]
                if (["class", "x1", "x2", "y1", "y2"].includes(attr.name)){
                    // pass
                } else {
                    console.log("Unrecognized attribute name " + attr.name + "!")
                }
            }
            //console.log(attributes)
            var path = new Path(get_attr(attributes, "x1"),
                                get_attr(attributes, "y1"))
            path.add_point(get_attr(attributes, "x2"),
                           get_attr(attributes, "y2"))
            //console.log(path)
            path.mark_finished();
            g_lines.push(path)
        }
        //var polyLines = parsedSVG.getElementsByTagName(/polyl|gi|one?s?/)
        //var polyLines = parsedSVG.getElementsByTagName(/poly(line)|(gon)/)

        //var polyLines = parsedSVG.getElementsByTagName("polyline")
        //polyLines += parsedSVG.getElementsByTagName("polygon")
        var polyThings = get_elements_by_tag_names(parsedSVG, ["polyline", "polygon"])
        //console.log("polyThings: " + polyThings)
        //var polyLines = parsedSVG.getElementsByTagName(/polyl|gi|one?/)
        for (var i = 0; i < polyThings.length; i++){
            var attributes = polyThings[i].attributes
            for (var j = 0; j < attributes.length; j++){
                var attr = attributes[j]
                if (["class", "points"].includes(attr.name)){
                    // pass
                } else {
                    console.log("Unrecognized attribute name " + attr.name + "!")
                }
            }
            var points_str = get_attr(attributes, "points")
            var points = points_str.split(/(\s+)/)
            var new_path = null
            for (var k = 0; k < points.length; k++){
                points[k] = points[k].replace(/\s/g, '')
                if (points[k].length === 0){
                    continue
                }
                var xy = points[k].split(",")
                /*
                try{
                    sanity_check(xy[1])
                }
                catch(err){
                    console.log(xy[0])
                    console.log(xy[1])
                }
                */
                x = parseFloat(xy[0])
                y = parseFloat(xy[1])
                if (k === 0){
                    new_path = new Path(x, y)
                } else {
                    new_path.add_point(x, y)
                }
            }
            if (polyThings[i].tagName.toLowerCase() === "polygon") {
                new_path.close_path()
            }
            new_path.mark_finished()
            g_lines.push(new_path)
            //console.log(path)
        }
        console.log("done")
        return
        var style = parsedSVG.getElementsByTagName("style")[0]
        console.log(style)
        console.log(style.type)
        console.log(style.childNodes[0].nodeValue)
        var path0 = parsedSVG.getElementsByTagName("path")[0]
        console.log(path0)
        var svg = parsedSVG.getElementsByTagName("svg")[0]
        var new_svg = document.getElementById("new_svg")
        for (var k = 0; k < svg.childNodes.length; k++){
            new_svg.appendChild(svg.childNodes[k])
            console.log(svg.childNodes[k])
        }
        //new_svg.childNodes = svg.childNodes;
        //console.log(svg)
        //document.appendChild(svg)
        return
        var lines = this.result.split('\n')
        var ignore_lines = ["<?xml", "<!--", "<svg", "<g>", "</g>"]
        for (var i = 0; i < lines.length; i++){
            var line = lines[i]
            var should_continue = false;
            for (var j = 0; j < ignore_lines.length; j++){
                if (line.startsWith(ignore_lines[j])){
                    should_continue = true;
                    break
                }
            }
            if (should_continue){
                continue;
            }
            if (line.startsWith("<style>")){

            }
            else{
                console.log("Unhandled line!" + line)
                unhandled_lines++;
            }
            if (unhandled_lines >= 10){
                break
            }
            
        }
    })
    file_reader.readAsText(file)
}

var g_line_mode = false;
var g_path_mode = true;
var g_line_started = false;
function game_loop() {
    var sleep_time_ms = 1000/g_frames_per_second;

    window.setInterval(function () {
        update_hover_location();
        clear_canvas();
        draw_axes();
        draw_lines();
    }, sleep_time_ms); // repeat forever, polling every second
}
game_loop();
