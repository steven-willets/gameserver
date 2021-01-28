const bodyParser = require("body-parser");
const express = require("express");
const app = express();

const port = 8080;

app.listen(port, () => {
  console.log(`Game Server listening at http://localhost:${port}`)
})

  app.get("/", function(req,res){
    res.sendFile(__dirname + "/client/index.html");
  });

  app.use(express.static(__dirname + "/client"))

  app.use("/assets", express.static(__dirname + "/client"))

  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());
  
  // Game State variables
  const gameState = {};
  const response = {
    "msg": "",
    "body": {
        "newLine": null,
        "heading": "",
        "message": ""
    }
  };

  //Create an array of the coordinates available on a specfic dimension grid
  function createGrid(height, width){
    let nodes = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i < width; i++) {
        x = i;
        for (let i = 0; i < height; i++) {
            y = i;
            nodes.push([x,y]);
        }
    }
    return nodes;
  }

  function matchCoords(obj,arr){
    // Find index of coord pair within an array
    for (let i = 0; i < arr.length; i++) {
        let coord = [obj.x,obj.y];
        if (arr[i][0] == coord[0] && arr[i][1] == coord[1]) {
            return i;
        }
    }
    return -1;
  };

  function deleteNode(node,arr){
    let i = matchCoords(node,arr);
    if (i !== -1) arr.splice(i, 1);
  }

  //Generate the 8 surrounding nodes for a given node, check if they're open
  function adjacentNode(node){
    let x = node[0];
    let y = node[1];
    //Separated into horizontal/vertical and diagonal because diagonal needs to be checked for intersection
    let tAdjacentArray = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
    let xAdjacentArray = [[x + 1, y - 1], [x + 1, y + 1], [x - 1, y + 1],  [x - 1, y - 1]];
    let openAdjNode = false;

    tAdjacentArray.forEach(function(e){
        if (matchCoords({x:e[0], y:e[1]}, gameState.openNodeArray) !== -1) openAdjNode = true;
    });

    xAdjacentArray.forEach(function(e){
        let i = matchCoords({x:e[0], y:e[1]}, gameState.openNodeArray);
        
        // Check if connecting to that node would intersect an existing line
        let tempCoord = e;
        let intersect = false;
        gameState.diagonalArray.forEach(function(e){
            if(segment_intersection(x, y, tempCoord[0], tempCoord[1], ...e)) intersect = true;
        });
        if (i !== -1 && !intersect) openAdjNode = true;
    });

    return openAdjNode;
  }

  function lineStart(node){
    if (gameState.turn === 1 || matchCoords(node,gameState.endNodeArray) > -1){
        gameState.storedNode = node;
        deleteNode(node, gameState.openNodeArray);

        // Response
        response.msg = "VALID_START_NODE";
        response.body.message = "Select a second node to complete the line.";
      } else {
        // Response
        response.msg = "INVALID_START_NODE";
        response.body.message = "You must start on either end of the path!";
      }
  }
  function lineEnd(node, player){
    let validNode = true;

    //Check if its an open node
    if (matchCoords(node,gameState.openNodeArray) !== -1){
        
        let xDiff = node.x - gameState.storedNode.x;
        let yDiff = node.y - gameState.storedNode.y;
        let xDiffAbs = Math.abs(xDiff);
        let yDiffAbs = Math.abs(yDiff);
        let diff = Math.max(xDiffAbs, yDiffAbs);
        let isDiagonal = xDiffAbs === yDiffAbs;

        //Verify node is horizontal, vertical, or 45deg relative to start node
        if (xDiff === 0 || yDiff === 0 || isDiagonal) {
            // Special validation for diagonal lines
            if (isDiagonal) {
                //Check if intersects any existing diagonal lines
                let tempArray = [node.x, node.y, gameState.storedNode.x, gameState.storedNode.y];
                gameState.diagonalArray.forEach(function(e){
                    if (segment_intersection(...tempArray, ...e)) validNode = false;
                });
                if (validNode) gameState.diagonalArray.push(tempArray);
            };

            // Special validation for multi-node lines
            if (diff > 1) {
                let tempCoords = [];
                let tempX = gameState.storedNode.x;
                let tempY = gameState.storedNode.y;
                let nodesOpen = true;

                for (let i = 1; i < diff;) {
                    tempX = tempX + Math.sign(xDiff);
                    tempY = tempY + Math.sign(yDiff);
                    tempCoords.push({x:tempX, y:tempY});
                    i++;
                };

                tempCoords.forEach(function(e){
                    if (matchCoords(e, gameState.openNodeArray) === -1) nodesOpen = false;
                }); 
                if (nodesOpen){
                    tempCoords.forEach(function(e){
                        deleteNode(e, gameState.openNodeArray);
                    });                
                } else {
                    validNode = false;
                };
            };
        } else {
            validNode = false;
        }
    } else {
        validNode = false;
    }
    
    if (validNode) {
        player = player === "Player 1" ? "Player 2" : "Player 1";

        //Update arrays
        if (gameState.turn === 1) {
            gameState.endNodeArray.push([gameState.storedNode.x, gameState.storedNode.y]);
        } else {
            deleteNode(gameState.storedNode, gameState.endNodeArray);
        }
        gameState.endNodeArray.push([node.x, node.y]);
        deleteNode(node, gameState.openNodeArray); //Remove clicked node from open  

        //Check if there are any valid moves at either end point
        let movesLeft = adjacentNode(gameState.endNodeArray[0]) || adjacentNode(gameState.endNodeArray[1]);
        if (gameState.openNodeArray.length === 0 || !movesLeft) {
            response.body.heading = `Game Over on Turn ${gameState.turn}`;
            response.body.message = `${player} has won`;
        } else {
            response.body.heading = player;
            response.body.message = `Awaiting ${player}'s move`;
            gameState.turn = gameState.turn + 1;
        }

        //Response
        response.msg = "VALID_END_NODE";
        response.body.newLine = {"start": gameState.storedNode, "end": node};              
    } else {
        gameState.openNodeArray.push([gameState.storedNode.x, gameState.storedNode.y]) //Restore initial node

        //Response
        response.msg = "INVALID_END_NODE";
        response.body.message = "Please select an unused node that is adjacent vertically, horizontally, or at a 45° angle!";
    }
    gameState.storedNode = [];
  }
    // Segment Intersection - Modified from https://gist.github.com/gordonwoodhull/50eb65d2f048789f9558
    const eps = 0.0000001;
    function between(a, b, c) {
        return a-eps <= b && b <= c+eps;
    }
    function segment_intersection(x1,y1,x2,y2, x3,y3,x4,y4) {
        var x=((x1*y2-y1*x2)*(x3-x4)-(x1-x2)*(x3*y4-y3*x4)) /
                ((x1-x2)*(y3-y4)-(y1-y2)*(x3-x4));
        var y=((x1*y2-y1*x2)*(y3-y4)-(y1-y2)*(x3*y4-y3*x4)) /
                ((x1-x2)*(y3-y4)-(y1-y2)*(x3-x4));
        if (isNaN(x)||isNaN(y)) {
            return false;
        } else {
            if (x1>=x2) {
                if (!between(x2, x, x1)) {return false;}
            } else {
                if (!between(x1, x, x2)) {return false;}
            }
            if (y1>=y2) {
                if (!between(y2, y, y1)) {return false;}
            } else {
                if (!between(y1, y, y2)) {return false;}
            }
            if (x3>=x4) {
                if (!between(x4, x, x3)) {return false;}
            } else {
                if (!between(x3, x, x4)) {return false;}
            }
            if (y3>=y4) {
                if (!between(y4, y, y3)) {return false;}
            } else {
                if (!between(y3, y, y4)) {return false;}
            }
            // Modification, intersection is ignored if it is a shared endpoint
            if ((x === x1 && y === y1) || (x === x2 && y === y2)) return false;
        }
        return true;
    }

  // INITIALIZE
  app.get("/initialize", function(req,res){
    // Establish initial game state
    gameState.turn = 1;
    gameState.openNodeArray = createGrid(4,4);

    gameState.storedNode = {};
    gameState.endNodeArray = [];
    gameState.diagonalArray = [];

    res.json({
        "msg": "INITIALIZE",
        "body": {
            "newLine": null,
            "heading": "Player 1",
            "message": "Awaiting Player 1's Move"
        }
    });
  });

  // NODE-CLICKED
  app.post("/node-clicked", function(req,res){
    let player = gameState.turn % 2 === 0 ? "Player 2" : "Player 1";
    response.body.heading = player;
    response.body.newLine = null;
    let node = req.body;

    if (!Object.keys(gameState.storedNode).length) {  // Start Click
        lineStart(node);
    } else {   //End Click
        lineEnd(node,player);
    }
    res.json(
      response
    );
  });
  
  // ERROR
  app.post("/error", function(req,res){
    console.log("error")
    res.json({
      "error": "Oops."
    });
  });