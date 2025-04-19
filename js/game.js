/**
 * game.js
 * 
 * This module implements the core Prisoner's Dilemma game mechanics.
 * It handles the game logic, scoring, and interactions between agents.
 */

/**
 * Payoff matrix for the Prisoner's Dilemma
 * Format: [player1Move][player2Move] = [player1Score, player2Score]
 * 
 * Modified Prisoner's Dilemma payoffs to be more balanced:
 * - Both cooperate: 3 points each (mutual cooperation)
 * - Both defect: 1 point each (mutual defection)
 * - One defects, one cooperates: Defector gets 4 points, cooperator gets 0 points (temptation to defect)
 * 
 * This reduces the advantage of defection slightly to give cooperative strategies a better chance.
 */
const PAYOFF_MATRIX = {
    [strategiesModule.COOPERATE]: {
        [strategiesModule.COOPERATE]: [3, 3], // Both cooperate
        [strategiesModule.DEFECT]: [0, 4]     // Player 1 cooperates, Player 2 defects
    },
    [strategiesModule.DEFECT]: {
        [strategiesModule.COOPERATE]: [4, 0], // Player 1 defects, Player 2 cooperates
        [strategiesModule.DEFECT]: [1, 1]     // Both defect
    }
};

/**
 * Agent class representing a participant in the Prisoner's Dilemma tournament
 */
class Agent {
    /**
     * Create a new agent
     * @param {string} strategyId - The ID of the strategy this agent uses
     * @param {number} id - Unique identifier for this agent
     */
    constructor(strategyId, id) {
        this.strategyId = strategyId;
        this.id = id;
        this.score = 0;
        this.alive = true;
        this.history = [];
    }

    /**
     * Make a move based on the agent's strategy and history
     * @returns {string} 'cooperate' or 'defect'
     */
    makeMove() {
        const strategyFunction = strategiesModule.strategies[this.strategyId].function;
        return strategyFunction(this.history);
    }

    /**
     * Record the result of a game
     * @param {string} myMove - This agent's move ('cooperate' or 'defect')
     * @param {string} opponentMove - Opponent's move ('cooperate' or 'defect')
     * @param {number} pointsEarned - Points earned in this game
     */
    recordGame(myMove, opponentMove, pointsEarned) {
        this.history.push({ myMove, opponentMove });
        this.score += pointsEarned;
    }

    /**
     * Reset the agent for a new tournament
     */
    reset() {
        this.score = 0;
        this.alive = true;
        this.history = [];
    }
}

/**
 * Play a single game of Prisoner's Dilemma between two agents
 * @param {Agent} agent1 - First agent
 * @param {Agent} agent2 - Second agent
 * @returns {Object} Result of the game with moves and scores
 */
function playGame(agent1, agent2) {
    const move1 = agent1.makeMove();
    const move2 = agent2.makeMove();
    
    const [score1, score2] = PAYOFF_MATRIX[move1][move2];
    
    agent1.recordGame(move1, move2, score1);
    agent2.recordGame(move2, move1, score2);
    
    return {
        agent1: { id: agent1.id, move: move1, score: score1 },
        agent2: { id: agent2.id, move: move2, score: score2 }
    };
}

/**
 * Play multiple games between two agents and determine the winner
 * @param {Agent} agent1 - First agent
 * @param {Agent} agent2 - Second agent
 * @param {number} numberOfGames - Number of games to play
 * @returns {Object} Result with the winner and game details
 */
function playMatch(agent1, agent2, numberOfGames) {
    // Reset scores for this match
    const initialScore1 = agent1.score;
    const initialScore2 = agent2.score;
    
    const gameResults = [];
    
    // Play the specified number of games
    for (let i = 0; i < numberOfGames; i++) {
        const result = playGame(agent1, agent2);
        gameResults.push(result);
    }
    
    // Calculate match scores (only for this match)
    const matchScore1 = agent1.score - initialScore1;
    const matchScore2 = agent2.score - initialScore2;
    
    // Determine the winner
    let winner = null;
    if (matchScore1 > matchScore2) {
        winner = agent1;
    } else if (matchScore2 > matchScore1) {
        winner = agent2;
    }
    // If scores are equal, favor the more cooperative strategy
    // This helps strategies like Tit-for-Tat that are generally more cooperative
    else {
        // Count cooperative moves
        const cooperativeMoves1 = agent1.history.slice(-numberOfGames).filter(move => move.myMove === strategiesModule.COOPERATE).length;
        const cooperativeMoves2 = agent2.history.slice(-numberOfGames).filter(move => move.myMove === strategiesModule.COOPERATE).length;
        
        if (cooperativeMoves1 > cooperativeMoves2) {
            winner = agent1;
        } else if (cooperativeMoves2 > cooperativeMoves1) {
            winner = agent2;
        } else {
            // If still tied, choose randomly
            winner = Math.random() < 0.5 ? agent1 : agent2;
        }
    }
    
    return {
        winner: winner.id,
        winnerStrategyId: winner.strategyId,
        agent1Score: matchScore1,
        agent2Score: matchScore2,
        gameResults
    };
}

// Create a global gameModule object
window.gameModule = {
    Agent,
    playGame,
    playMatch,
    PAYOFF_MATRIX
}; 