"use client";

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface PredictionComparisonChartProps {
  playerOutName: string;
  playerInName: string;
  playerOutHistory?: Record<number, any>;
  playerInHistory?: Record<number, any>;
}

export function PredictionComparisonChart({
  playerOutName,
  playerInName,
  playerOutHistory,
  playerInHistory
}: PredictionComparisonChartProps) {
  if (!playerOutHistory || !playerInHistory) {
    return (
      <div className="p-4 text-xs text-red-500 bg-red-50 rounded border border-red-200 mt-2">
        Debug: Missing history data.
        <br />
        Out: {playerOutHistory ? 'OK' : 'Missing'}
        <br />
        In: {playerInHistory ? 'OK' : 'Missing'}
      </div>
    );
  }

  const gameweeks = Object.keys(playerInHistory).map(Number).sort((a, b) => a - b);
  
  if (gameweeks.length === 0) {
    return (
      <div className="p-4 text-xs text-yellow-500 bg-yellow-50 rounded border border-yellow-200 mt-2">
        Debug: History data is empty.
      </div>
    );
  }

  const data = gameweeks.map(gw => ({
    name: `GW${gw}`,
    [playerOutName]: playerOutHistory[gw]?.xPts || 0,
    [playerInName]: playerInHistory[gw]?.xPts || 0,
  }));

  return (
    <div className="w-full h-[200px] mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip 
            contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            labelStyle={{ color: '#666', marginBottom: '4px' }}
          />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
          <Line 
            type="monotone" 
            dataKey={playerOutName} 
            stroke="#ef4444" 
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line 
            type="monotone" 
            dataKey={playerInName} 
            stroke="#22c55e" 
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
