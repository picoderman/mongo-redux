import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type TestState = {
  some: string;
  data: number[];
  value: boolean;
};

const initialState: TestState = {
  some: 'value',
  data: [],
  value: false,
};

export const slice = createSlice({
  name: 'test',
  initialState,
  reducers: {
    setSome: (state, action) => {
      state.some = action.payload;
    },
    addData: (state, action: PayloadAction<number>) => {
      state.data.push(action.payload);
    },
    toggleValue: (state) => {
      state.value = !state.value;
    }
  },
  selectors: {
    selectSome: (state) => state.some,
    selectData: (state) => state.data,
    selectValue: (state) => state.value,
  }
});
