const {
    parseSelectQuery,
    parseInsertQuery,
    parseDeleteQuery,
  } = require("./queryParser");
  const { readCSV, writeCSV } = require("./csvReader");
  
  
  function performInnerJoin(mainData, joinData, joinCondition, selectedFields, mainTable) {
    return mainData.flatMap((mainRow) => {
      return joinData
        .filter((joinRow) => {
          const mainValue = mainRow[joinCondition.left.split(".")[1]];
          const joinValue = joinRow[joinCondition.right.split(".")[1]];
          return mainValue === joinValue;
        })
        .map((joinRow) => {
          return selectedFields.reduce((acc, field) => {
            const [tableName, fieldName] = field.split(".");
            acc[field] =
              tableName === mainTable ? mainRow[fieldName] : joinRow[fieldName];
            return acc;
          }, {});
        });
    });
  }
  
  
  function performLeftJoin(mainData, joinData, joinCondition, selectedFields, mainTable) {
    return mainData.flatMap((mainRow) => {
      const matchedJoinRows = joinData.filter((joinRow) => {
        const mainValue = getValueFromRow(mainRow, joinCondition.left);
        const joinValue = getValueFromRow(joinRow, joinCondition.right);
        return mainValue === joinValue;
      });
  
      if (matchedJoinRows.length === 0) {
        return [createResultRow(mainRow, null, selectedFields, mainTable, true)];
      }
  
      return matchedJoinRows.map((joinRow) =>
        createResultRow(mainRow, joinRow, selectedFields, mainTable, true)
      );
    });
  }
  
  
  function getValueFromRow(row, compoundFieldName) {
    const [tableName, fieldName] = compoundFieldName.split(".");
    return row[`${tableName}.${fieldName}`] || row[fieldName];
  }
  function performRightJoin(mainData, joinData, joinCondition, selectedFields, mainTable) {
    const mainTableStructure =
      mainData.length > 0
        ? Object.keys(mainData[0]).reduce((acc, key) => {
            acc[key] = null; // Initialize values to null
            return acc;
          }, {})
        : {};
  
    return joinData.map((joinRow) => {
      const matchingMainRow = mainData.find((mainRow) => {
        const mainValue = getValueFromRow(mainRow, joinCondition.left);
        const joinValue = getValueFromRow(joinRow, joinCondition.right);
        return mainValue === joinValue;
      });
  
      const mainRowToUse = matchingMainRow || mainTableStructure;
  
      return createResultRow(mainRowToUse, joinRow, selectedFields, mainTable, true);
    });
  }
  
  function createResultRow(mainRow, joinRow, selectedFields, mainTable, includeAllMainFields) {
    const resultRow = {};
  
    if (includeAllMainFields) {
      Object.keys(mainRow || {}).forEach((key) => {
        const prefixedKey = `${mainTable}.${key}`;
        resultRow[prefixedKey] = mainRow ? mainRow[key] : null;
      });
    }
  
    selectedFields.forEach((field) => {
      const [tableName, fieldName] = field.includes(".")
        ? field.split(".")
        : [mainTable, field];
      resultRow[field] =
        tableName === mainTable && mainRow
          ? mainRow[fieldName]
          : joinRow
          ? joinRow[fieldName]
          : null;
    });
  
    return resultRow;
  }
  
  
  function evaluateCondition(row, clause) {
    let { field, operator, value } = clause;
  
    if (row[field] === undefined) {
      throw new Error(`Invalid field: ${field}`);
    }
  
    const conditionValue = parseValue(value);
    const rowValue = parseValue(row[field]);
  
    if (operator === "LIKE") {
      const regexPattern = "^" + value.replace(/%/g, ".*").replace(/_/g, ".") + "$";
      const regex = new RegExp(regexPattern, "i");
      return regex.test(row[field]);
    }
  
    switch (operator) {
      case "=":
        return rowValue === conditionValue;
      case ">":
        return rowValue > conditionValue;
      case "<":
        return rowValue < conditionValue;
      case ">=":
        return rowValue >= conditionValue;
      case "<=":
        return rowValue <= conditionValue;
      case "!=":
        return rowValue !== conditionValue;
      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  }
  
  function parseValue(value) {
    if (value === undefined || value === null) {
      return value;
    }
  
    if (typeof value === "string" &&
      ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"')))) {
      value = value.substring(1, value.length - 1);
    }
  
    if (!isNaN(value) && value.trim() !== "") {
      return Number(value);
    }
  
    return value;
  }
  
  function applyGroupBy(data, groupByFields, aggregateFunctions) {
    const groupedData = {};
  
    data.forEach((row) => {
      const groupKey = groupByFields.map((field) => row[field]).join("-");
  
      if (!groupedData[groupKey]) {
        groupedData[groupKey] = { count: 0, sums: {}, mins: {}, maxes: {} };
        groupByFields.forEach(
          (field) => (groupedData[groupKey][field] = row[field])
        );
      }
  
      groupedData[groupKey].count += 1;
  
      aggregateFunctions.forEach((func) => {
        const match = /(\w+)\((\w+)\)/.exec(func);
        if (match) {
          const [, aggFunc, aggField] = match;
          const value = parseFloat(row[aggField]);
  
          switch (aggFunc.toUpperCase()) {
            case "MAX":
              groupedData[groupKey].maxes[aggField] = Math.max(
                groupedData[groupKey].maxes[aggField] || value,
                value
              );
              break;
            case "SUM":
              groupedData[groupKey].sums[aggField] =
                (groupedData[groupKey].sums[aggField] || 0) + value;
              break;
            case "MIN":
              groupedData[groupKey].mins[aggField] = Math.min(
                groupedData[groupKey].mins[aggField] || value,
                value
              );
              break;
          }
        }
      });
    });
  
    return Object.values(groupedData).map((group) => {
      const finalGroup = {};
      groupByFields.forEach((field) => (finalGroup[field] = group[field]));
      aggregateFunctions.forEach((func) => {
        const match = /(\w+)\((\*|\w+)\)/.exec(func);
        if (match) {
          const [, aggFunc, aggField] = match;
          switch (aggFunc.toUpperCase()) {
            case "MIN":
              finalGroup[func] = group.mins[aggField];
              break;
            case "MAX":
              finalGroup[func] = group.maxes[aggField];
              break;
            case "COUNT":
              finalGroup[func] = group.count;
              break;
            case "SUM":
              finalGroup[func] = group.sums[aggField];
              break;
          }
        }
      });
      return finalGroup;
    });
  }
  
  async function executeSELECTQuery(query) {
    try {
      const {
        fields,
        table,
        whereClauses,
        joinType,
        joinTable,
        joinCondition,
        groupByFields,
        hasAggregateWithoutGroupBy,
        orderByFields,
        limit,
        isDistinct,
      } = parseSelectQuery(query);
      let data = await readCSV(`${table}.csv`);
  
      if (joinTable && joinCondition) {
        const joinData = await readCSV(`${joinTable}.csv`);
        switch (joinType.toUpperCase()) {
          case "INNER":
            data = performInnerJoin(data, joinData, joinCondition, fields, table);
            break;
          case "LEFT":
            data = performLeftJoin(data, joinData, joinCondition, fields, table);
            break;
          case "RIGHT":
            data = performRightJoin(data, joinData, joinCondition, fields, table);
            break;
          default:
            throw new Error(`Unsupported JOIN type: ${joinType}`);
        }
      }
  
      let filteredData =
        whereClauses.length > 0
          ? data.filter((row) =>
              whereClauses.every((clause) => evaluateCondition(row, clause))
            )
          : data;
  
      if (hasAggregateWithoutGroupBy) {
        const result = {};
  
        fields.forEach((field) => {
          const match = /(\w+)\((\*|\w+)\)/.exec(field);
          if (match) {
            const [, aggFunc, aggField] = match;
            switch (aggFunc.toUpperCase()) {
              case "COUNT":
                result[field] = filteredData.length;
                break;
              case "AVG":
                result[field] =
                  filteredData.reduce(
                    (acc, row) => acc + parseFloat(row[aggField]),
                    0
                  ) / filteredData.length;
                break;
              case "MIN":
                result[field] = Math.min(
                  ...filteredData.map((row) => parseFloat(row[aggField]))
                );
                break;
              case "MAX":
                result[field] = Math.max(
                  ...filteredData.map((row) => parseFloat(row[aggField]))
                );
                break;
              case "SUM":
                result[field] = filteredData.reduce(
                  (acc, row) => acc + parseFloat(row[aggField]),
                  0
                );
                break;
            }
          }
        });
  
        return [result];
      } else if (groupByFields) {
        const groupedData = applyGroupBy(filteredData, groupByFields, fields);
  
        let sortedGroupedData = groupedData;
        if (orderByFields) {
          sortedGroupedData = groupedData.sort((a, b) => {
            for (let { fieldName, order } of orderByFields) {
              if (a[fieldName] < b[fieldName]) {
                return order === "ASC" ? -1 : 1;
              }
              if (a[fieldName] > b[fieldName]) {
                return order === "ASC" ? 1 : -1;
              }
            }
            return 0;
          });
        }

        if (limit !== null) {
          sortedGroupedData = sortedGroupedData.slice(0, limit);
        }
        return sortedGroupedData;
      } else {
        let sortedData = filteredData;
        if (orderByFields) {
          sortedData = filteredData.sort((a, b) => {
            for (let { fieldName, order } of orderByFields) {
              if (a[fieldName] > b[fieldName]) return order === "ASC" ? 1 : -1;
  
              if (a[fieldName] < b[fieldName]) return order === "ASC" ? -1 : 1;
            }
            return 0;
          });
        }
  
        // Select the specified fields
        let finalResults = sortedData.map((row) => {
          const selectedRow = {};
          fields.forEach((field) => {
            selectedRow[field] = row[field];
          });
          return selectedRow;
        });
  
        let distinctResults = finalResults;
        if (isDistinct) {
          distinctResults = [
            ...new Map(
              finalResults.map((item) => [
                fields.map((field) => item[field]).join("|"),
                item,
              ])
            ).values(),
          ];
        }
  
        let limitedResults = distinctResults;
        if (limit !== null) {
          limitedResults = distinctResults.slice(0, limit);
        }
        return limitedResults;
      }
    } catch (error) {
      throw new Error(`Error executing query: ${error.message}`);
    }
  }
  
  async function executeINSERTQuery(query) {
    console.log(parseInsertQuery(query));
    const { table, columns, values } = parseInsertQuery(query);
    const data = await readCSV(`${table}.csv`);
  
    // Create a new row object
    const newRow = {};
    columns.forEach((column, index) => {
      let value = values[index];
      if (value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      newRow[column] = value;
    });
  
    data.push(newRow);
  
    await writeCSV(`${table}.csv`, data);
  
    return { message: "Row inserted successfully." };
  }
  
  
  async function executeDELETEQuery(query) {
    const { table, whereClauses } = parseDeleteQuery(query);
    let data = await readCSV(`${table}.csv`);
  
    // Filter data to remove rows that satisfy where clauses
    if (whereClauses.length > 0) {
      data = data.filter((row) => !whereClauses.every((clause) => evaluateCondition(row, clause)));
    } else {
      // Clear all data if no where clauses are specified
      data = [];
    }
  
    // Save the updated data back to the CSV file
    await writeCSV(`${table}.csv`, data);
  
    return { message: "Rows deleted successfully." };
  }
  
  module.exports = { executeSELECTQuery, executeINSERTQuery, executeDELETEQuery };
  