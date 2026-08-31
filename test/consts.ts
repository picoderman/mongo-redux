import { createSlice } from "@reduxjs/toolkit";

export const containerTestTimeout = 15_000;

export const slice = createSlice({
  name: 'counter',
  initialState: { value: 0, values: [] as number[] },
  reducers: {
    add: (state, action) => {
      state.value += action.payload;
      state.values.push(action.payload);
    },
    noop: (state) => state,
    set: (state, action) => {
      state.value = action.payload;
    },
  },
});
